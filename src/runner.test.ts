import { describe, it, expect, vi } from "vitest";
import type { TestRequest, Usage } from "./types.js";
import { classifyFailure, redactSecrets, sanitizeUrl, mergeUsage, isUnsupportedProtocol, retryable, runTest, runTestStream } from "./runner.js";

function req(over: Partial<TestRequest> = {}): TestRequest {
  return {
    protocol: "openai-chat",
    baseUrl: "https://api.x.com",
    apiKey: "sk-secret-123",
    model: "m",
    input: "hi",
    stream: false,
    timeoutMs: 30000,
    maxRetries: 0,
    maxTokens: 64,
    userAgent: "",
    ...over,
  };
}

const NIL: Usage = { inputTokens: null, outputTokens: null, totalTokens: null };

describe("redactSecrets", () => {
  it("redacts the exact apiKey wherever it appears", () => {
    const out = redactSecrets("key=sk-secret-123 and again sk-secret-123", req());
    expect(out).not.toContain("sk-secret-123");
    expect(out).toContain("[REDACTED_API_KEY]");
  });

  it("redacts Authorization Bearer tokens", () => {
    const out = redactSecrets("Authorization: Bearer abc.def.ghi", req({ apiKey: "" }));
    expect(out).toBe("Authorization: Bearer [REDACTED]");
  });

  it("redacts x-api-key / x-goog-api-key header values", () => {
    expect(redactSecrets("x-api-key: zzz999", req({ apiKey: "" }))).toContain("[REDACTED]");
    expect(redactSecrets("x-goog-api-key: zzz999", req({ apiKey: "" }))).toContain("[REDACTED]");
    expect(redactSecrets("x-api-key: zzz999", req({ apiKey: "" }))).not.toContain("zzz999");
  });

  it("redacts token=... in query-style strings", () => {
    const out = redactSecrets("https://h/p?token=abc123&x=1", req({ apiKey: "" }));
    expect(out).not.toContain("abc123");
    expect(out).toContain("x=1");
  });
});

describe("sanitizeUrl", () => {
  it("redacts sensitive query params", () => {
    const out = sanitizeUrl("https://h/p?key=abc&token=def&safe=1", req({ apiKey: "" }));
    expect(out).not.toContain("abc");
    expect(out).not.toContain("def");
    expect(out).toContain("safe=1");
  });

  it("redacts the apiKey embedded in the path", () => {
    const out = sanitizeUrl("https://h/sk-secret-123/chat", req());
    expect(out).not.toContain("sk-secret-123");
  });

  it("falls back to redactSecrets on non-URL input", () => {
    expect(sanitizeUrl("not a url sk-secret-123", req())).not.toContain("sk-secret-123");
  });
});

describe("mergeUsage", () => {
  it("returns acc unchanged when next is undefined", () => {
    expect(mergeUsage(NIL, undefined)).toEqual(NIL);
  });

  it("fills nulls from next", () => {
    expect(mergeUsage(NIL, { inputTokens: 10 })).toEqual({ inputTokens: 10, outputTokens: null, totalTokens: null });
  });

  it("keeps the max value (guards against incremental/cumulative regress)", () => {
    expect(mergeUsage({ inputTokens: 10, outputTokens: 50, totalTokens: null }, { outputTokens: 30 }).outputTokens).toBe(
      50,
    );
    expect(mergeUsage({ inputTokens: 10, outputTokens: 50, totalTokens: null }, { outputTokens: 80 }).outputTokens).toBe(
      80,
    );
  });

  it("derives total when input+output known but total missing", () => {
    expect(mergeUsage(NIL, { inputTokens: 10, outputTokens: 20 }).totalTokens).toBe(30);
  });

  it("recomputes a derived total as output tokens increase", () => {
    const first = mergeUsage(NIL, { inputTokens: 10, outputTokens: 1 });
    expect(first).toEqual({ inputTokens: 10, outputTokens: 1, totalTokens: 11 });

    const second = mergeUsage(first, { outputTokens: 5 });
    expect(second).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });
});

describe("failure classification", () => {
  it("only treats a 404 as unsupported when the body identifies an endpoint/route problem", () => {
    expect(classifyFailure(404, "route not found")).toBe("unsupported_protocol");
    expect(isUnsupportedProtocol(404, "route not found")).toBe(true);
    expect(classifyFailure(404, "Not Found")).toBe("request_failed");
    expect(isUnsupportedProtocol(404, "Not Found")).toBe(false);
    expect(classifyFailure(405)).toBe("unsupported_protocol");
    expect(classifyFailure(501)).toBe("unsupported_protocol");
  });

  it("distinguishes missing models from unsupported endpoints", () => {
    expect(classifyFailure(404, '{"error":{"code":"model_not_found","message":"Model foo not found"}}')).toBe(
      "model_not_found",
    );
    expect(isUnsupportedProtocol(404, "Model foo not found")).toBe(false);
  });

  it("distinguishes permission failures even when a provider hides them behind 404", () => {
    expect(classifyFailure(404, "You do not have access to model foo")).toBe("permission_denied");
    expect(classifyFailure(403, "Forbidden")).toBe("permission_denied");
  });

  it("matches endpoint phrases on 400/422", () => {
    expect(isUnsupportedProtocol(400, "Unsupported protocol")).toBe(true);
    expect(isUnsupportedProtocol(422, "route not found")).toBe(true);
    expect(isUnsupportedProtocol(400, "invalid api key")).toBe(false);
  });

  it("ignores unrelated successful responses", () => {
    expect(isUnsupportedProtocol(200)).toBe(false);
  });
});

describe("retryable", () => {
  it("retries network(0)/408/429/5xx only", () => {
    expect(retryable(0)).toBe(true);
    expect(retryable(408)).toBe(true);
    expect(retryable(429)).toBe(true);
    expect(retryable(500)).toBe(true);
    expect(retryable(503)).toBe(true);
    expect(retryable(400)).toBe(false);
    expect(retryable(401)).toBe(false);
    expect(retryable(404)).toBe(false);
  });
});

describe("stream probe", () => {
  it("stops the upstream body after the first delta", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(upstream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })));

    try {
      const reader = runTestStream(req({ stream: true }), undefined, { stopAfterFirstDelta: true }).getReader();
      const decoder = new TextDecoder();
      let output = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }

      expect(output).toContain('"type":"delta"');
      expect(output).toContain('"type":"done"');
      expect(output).toContain("first");
      expect(cancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("stream completion semantics", () => {
  async function finalResultFor(events: string, protocol: TestRequest["protocol"] = "openai-chat") {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(events));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      ),
    );

    const reader = runTestStream(req({ protocol, stream: true })).getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }
    const parsed = output
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    const doneLine = [...parsed].reverse().find((event: any) => event.type === "done");
    return doneLine?.result;
  }

  it("fails when Chat Completions emits text but closes before [DONE]", async () => {
    try {
      const result = await finalResultFor('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      expect(result).toMatchObject({
        ok: false,
        status: 200,
        text: "partial",
        failureKind: "request_failed",
      });
      expect(result.error).toContain("完成标记");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("succeeds only after the Chat Completions [DONE] marker", async () => {
    try {
      const result = await finalResultFor(
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
      );
      expect(result).toMatchObject({ ok: true, status: 200, text: "ok" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats response.failed as failure even after Responses emitted text", async () => {
    try {
      const result = await finalResultFor(
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n' +
          'data: {"type":"response.failed","response":{"error":{"message":"upstream failed"}}}\n\n',
        "openai-responses",
      );
      expect(result).toMatchObject({ ok: false, status: 200, text: "partial", failureKind: "request_failed" });
      expect(result.error).toContain("upstream failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats response.incomplete as failure", async () => {
    try {
      const result = await finalResultFor(
        'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n',
        "openai-responses",
      );
      expect(result).toMatchObject({ ok: false, status: 200 });
      expect(result.error).toContain("max_output_tokens");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("external cancellation", () => {
  it("aborts an active non-stream upstream request", async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    try {
      const running = runTest(req(), controller.signal);
      await Promise.resolve();
      controller.abort();
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("aborts retry backoff before another request starts", async () => {
    const fetchMock = vi.fn(async () => new Response("retry", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    try {
      const running = runTest(req({ maxRetries: 3 }), controller.signal);
      setTimeout(() => controller.abort(), 10);
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("aborts an active stream upstream request", async () => {
    const capture: { signal?: AbortSignal } = {};
    vi.stubGlobal("fetch", vi.fn((_input: unknown, init?: RequestInit) => {
      capture.signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }));
    const controller = new AbortController();

    try {
      const reader = runTestStream(req({ stream: true }), controller.signal).getReader();
      const reading = reader.read();
      await Promise.resolve();
      controller.abort();
      await expect(reading).resolves.toEqual({ done: true, value: undefined });
      expect(capture.signal).toBeDefined();
      expect(capture.signal?.aborted).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
