import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DualTestResult, RowTestResult } from "./types.js";

function post(path: string, body: unknown): Request {
  return new Request(`http://x.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api test-dual", () => {
  it("aggregates non-stream and stream probe results", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
      if (body.stream) {
        return streamResponse([
          'data: {"choices":[{"delta":{"content":"he"}}]}\n',
          '\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
          'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
          "data: [DONE]\n\n",
        ]);
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: "json ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(post("/api/test-dual", {
      protocol: "openai-chat",
      baseUrl: "https://api.example.com",
      apiKey: "sk",
      model: "m",
      input: "hi",
      timeoutMs: 1000,
      maxRetries: 0,
      maxTokens: 1,
    }));

    expect(res.status).toBe(200);
    const result = await res.json() as DualTestResult;
    expect(result).toMatchObject({
      json: { ok: true, text: "json ok" },
      stream: { ok: true, text: "hello", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
      streamVerdict: "stream",
    });
    expect(typeof result.streamTtftMs).toBe("number");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aggregates a row probe through one API request", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
      if (body.stream) {
        return streamResponse([
          'data: {"choices":[{"delta":{"content":"stream ok"}}]}\n\n',
          'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
          "data: [DONE]\n\n",
        ]);
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: "json ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(post("/api/test-row", {
      protocols: ["openai-chat"],
      baseUrl: "https://api.example.com",
      apiKey: "sk",
      model: "m",
      input: "hi",
      timeoutMs: 1000,
      maxRetries: 0,
      maxTokens: 1,
    }));

    expect(res.status).toBe(200);
    const result = await res.json() as RowTestResult;
    expect(result.results["openai-chat"]).toMatchObject({
      json: { ok: true, text: "json ok" },
      stream: { ok: true, text: "stream ok" },
      streamVerdict: "stream",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects row probes above the per-invocation protocol limit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(post("/api/test-row", {
      protocols: ["openai-chat", "openai-responses", "gemini"],
      baseUrl: "https://api.example.com",
      apiKey: "sk",
      model: "m",
      input: "hi",
      timeoutMs: 1000,
      maxRetries: 0,
      maxTokens: 1,
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "单行聚合探测最多支持 2 个协议" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
