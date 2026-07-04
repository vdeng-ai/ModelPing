import { afterEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function authDeniedResponse() {
  return new Response(JSON.stringify({ error: "访问口令错误" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

async function loadApiWithStalePassword() {
  vi.resetModules();
  const storage = new MemoryStorage();
  storage.setItem("app_password", "stale");
  const fetchMock = vi.fn(() => Promise.resolve(authDeniedResponse()));
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./api.js");
  return { api, fetchMock, storage };
}

async function loadApi(fetchMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  const storage = new MemoryStorage();
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("fetch", fetchMock);
  return import("./api.js");
}

const payload = {
  protocol: "openai-chat",
  baseUrl: "https://api.example.com",
  apiKey: "sk",
  model: "m",
  input: "hi",
  stream: false,
  timeoutMs: 1000,
  maxRetries: 0,
  maxTokens: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api auth failures", () => {
  it("sends the entered password without trimming it", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const api = await loadApi(fetchMock);

    api.setAppPassword(" pw ");
    await expect(api.fetchSettings()).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      headers: { "x-app-password": " pw " },
      cache: "no-cache",
    });
  });

  it("clears stale session password when settings fetch returns 401", async () => {
    const { api, fetchMock, storage } = await loadApiWithStalePassword();

    await expect(api.fetchSettings()).rejects.toSatisfy((e: unknown) => api.isAuthError(e));

    expect(storage.getItem("app_password")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      headers: { "x-app-password": "stale" },
      cache: "no-cache",
    });
  });

  it("clears stale session password when private-state fetch returns 401", async () => {
    const { api, fetchMock, storage } = await loadApiWithStalePassword();

    await expect(api.fetchPrivateState()).rejects.toSatisfy((e: unknown) => api.isAuthError(e));

    expect(storage.getItem("app_password")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/private-state", {
      headers: { "x-app-password": "stale" },
      cache: "no-cache",
    });
  });
});

describe("api failed test results", () => {
  it("normalizes non-2xx JSON test responses into TestResult", async () => {
    const api = await loadApi(vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }))));

    const result = await api.runTestJson(payload);

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      latencyMs: 0,
      error: "bad request",
      requestUrl: null,
      attempts: 0,
    });
  });

  it("normalizes dual network failures into both result slots", async () => {
    const api = await loadApi(vi.fn(() => Promise.reject(new Error("network down"))));

    const result = await api.runTestDual(payload);

    expect(result.streamVerdict).toBe("none");
    expect(result.streamTtftMs).toBeNull();
    expect(result.json).toMatchObject({ ok: false, status: 0, error: "network down", attempts: 0 });
    expect(result.stream).toMatchObject({ ok: false, status: 0, error: "network down", attempts: 0 });
  });

  it("returns a failed stream result when SSE never sends done", async () => {
    const api = await loadApi(vi.fn(() => Promise.resolve(new Response(
      "data: {\"type\":\"delta\",\"text\":\"x\"}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ))));
    const events: unknown[] = [];

    const result = await api.runTestStream(payload, (ev) => events.push(ev));

    expect(events).toHaveLength(1);
    expect(result).toMatchObject({
      ok: false,
      status: 0,
      error: "流式未返回最终结果",
      attempts: 0,
    });
  });
});
