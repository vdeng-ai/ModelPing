import { afterEach, describe, expect, it, vi } from "vitest";
import { pingEndpoint } from "./ping.js";
import type { PingRequest } from "./types.js";

const req: PingRequest = {
  protocol: "openai-chat",
  baseUrl: "https://api.example.com",
  apiKey: "sk",
  model: "m",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pingEndpoint", () => {
  it("propagates external cancellation instead of reporting a timeout", async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const running = pingEndpoint(req, controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
