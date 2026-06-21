import { describe, expect, it } from "vitest";
import { runConcurrent } from "./concurrency.js";

describe("runConcurrent", () => {
  it("respects the concurrency limit and reports each completed item", async () => {
    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];
    const controller = new AbortController();

    await runConcurrent(
      [1, 2, 3, 4, 5],
      2,
      controller.signal,
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      },
      () => completed.push(completed.length + 1),
    );

    expect(maxActive).toBe(2);
    expect(completed).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops queued work and does not report aborted tasks as completed", async () => {
    const controller = new AbortController();
    let started = 0;
    let completed = 0;

    const running = runConcurrent(
      [1, 2, 3, 4, 5],
      2,
      controller.signal,
      async (_item, signal) => {
        started++;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
      () => completed++,
    );

    await Promise.resolve();
    controller.abort();
    await running;

    expect(started).toBe(2);
    expect(completed).toBe(0);
  });
});
