import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, isTimeoutError, TimeoutError } from "./fetch-timeout.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("marks internal timeout errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const running = fetchWithTimeout("https://api.example.com", {}, 50).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(50);

    const error = await running;
    expect(error).toBeInstanceOf(TimeoutError);
    expect(isTimeoutError(error)).toBe(true);
  });

  it("propagates external cancellation instead of reporting timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();

    const running = fetchWithTimeout("https://api.example.com", {}, 30000, controller.signal).catch((error: unknown) => error);
    await Promise.resolve();
    controller.abort();

    const error = await running;
    expect(error).toMatchObject({ name: "AbortError" });
    expect(isTimeoutError(error)).toBe(false);
  });
});
