import { afterEach, describe, expect, it, vi } from "vitest";
import { pingBatch, pingEndpoint } from "./ping.js";
import type { PingBatchEntry, PingRequest } from "./types.js";

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

describe("pingBatch", () => {
  it("deduplicates /models probes for entries sharing one connection", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const entries: PingBatchEntry[] = [
      { id: "a", ...req, model: "m1" },
      { id: "b", ...req, model: "m2" },
    ];
    const result = await pingBatch(entries);

    expect(result.results.a).toMatchObject({ ok: true, kind: "models", status: 200 });
    expect(result.results.b).toMatchObject({ ok: true, kind: "models", status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back per model only after all /models candidates are unsupported", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") return new Response("", { status: 404 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries: PingBatchEntry[] = [
      { id: "a", ...req, model: "m1" },
      { id: "b", ...req, model: "m2" },
    ];
    const result = await pingBatch(entries);

    expect(result.results.a.kind).toBe("completion");
    expect(result.results.b.kind).toBe("completion");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
