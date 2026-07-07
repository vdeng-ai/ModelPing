import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { SettingsStore } from "./store/index.js";

class MemoryStore implements SettingsStore {
  constructor(private value: string | null) {}

  get(): Promise<string | null> {
    return Promise.resolve(this.value);
  }

  put(value: string): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }
}

describe("api bootstrap", () => {
  it("returns health, settings and private-state in one authenticated response", async () => {
    const app = createApp();
    const settings = {
      providers: [],
      defaults: {
        input: "hi",
        timeoutMs: 1000,
        maxRetries: 0,
        maxTokens: 1,
        userAgent: "",
        concurrency: 1,
      },
    };

    const res = await app.fetch(
      new Request("http://x.test/api/bootstrap"),
      { store: new MemoryStore(JSON.stringify(settings)), privateStore: new MemoryStore(null), PRIVATE_STATE_SECRET: "secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      health: {
        ok: true,
        needPassword: false,
        persistence: { settings: true, privateState: true, privateStateScope: "full" },
      },
      settings,
      privateState: {
        v: 1,
        history: [],
        conn: null,
        config: null,
        statusEntries: [],
      },
    });
  });

  it("stays behind the app password gate", async () => {
    const app = createApp();

    const res = await app.fetch(
      new Request("http://x.test/api/bootstrap"),
      { APP_PASSWORD: "pw", store: new MemoryStore(null) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "访问口令错误" });
  });
});
