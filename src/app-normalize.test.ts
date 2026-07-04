import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

function post(path: string, body: unknown): Request {
  return new Request(`http://x.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api request normalization", () => {
  it("keeps the invalid baseUrl error for test requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(post("/api/test", {
      protocol: "openai-chat",
      baseUrl: "not a url",
      apiKey: "sk",
      model: "m",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "baseUrl 不是合法 URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the invalid protocol error for ping requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();

    const res = await app.fetch(post("/api/ping", {
      protocol: "bad",
      baseUrl: "https://api.example.com",
      apiKey: "sk",
      model: "m",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "protocol 非法" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
