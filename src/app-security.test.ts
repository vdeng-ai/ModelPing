import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, type Env } from "./app.js";

function jsonReq(path: string, body: unknown): Request {
  return new Request(`http://x.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const testPayload = {
  protocol: "openai-chat",
  baseUrl: "https://blocked.example.com",
  apiKey: "sk",
  model: "m",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api target safety policy", () => {
  it("rejects /api/test targets outside ALLOWED_HOSTS before upstream fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(jsonReq("/api/test", testPayload), {
      ALLOWED_HOSTS: "api.example.com",
    } satisfies Env);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "目标主机不在允许列表内" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects /api/models private targets before upstream fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(jsonReq("/api/models", {
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "sk",
    }), {
      BLOCK_PRIVATE_HOSTS: "1",
    } satisfies Env);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "目标主机为私有/本地地址，已被禁止" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects /api/ping targets outside ALLOWED_HOSTS before upstream fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(jsonReq("/api/ping", testPayload), {
      ALLOWED_HOSTS: "api.example.com",
    } satisfies Env);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "目标主机不在允许列表内" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
