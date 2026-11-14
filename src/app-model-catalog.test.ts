import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { SettingsStore } from "./store/index.js";

class MemoryStore implements SettingsStore {
  value: string | null = null;
  get() { return Promise.resolve(this.value); }
  put(value: string) { this.value = value; return Promise.resolve(); }
}

afterEach(() => vi.unstubAllGlobals());

describe("manual model catalog sync", () => {
  it("only reads the stored snapshot until the explicit sync endpoint is called", async () => {
    const store = new MemoryStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      openai: { name: "OpenAI", api: "https://api.openai.com/v1", models: { "gpt-new": { name: "GPT New" } } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const env = { catalogStore: store };

    const initial = await app.fetch(new Request("https://modelping.test/api/model-catalog"), env);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ available: true, providers: [], updatedAt: null });
    expect(fetchMock).not.toHaveBeenCalled();

    const synced = await app.fetch(new Request("https://modelping.test/api/model-catalog/sync", { method: "POST", body: "{}" }), env);
    expect(synced.status).toBe(200);
    expect(await synced.json()).toMatchObject({ source: "models.dev", providers: [{ id: "openai", models: [{ id: "gpt-new" }] }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = await app.fetch(new Request("https://modelping.test/api/model-catalog"), env);
    expect(await cached.json()).toMatchObject({ providers: [{ id: "openai" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires the configured app password", async () => {
    const app = createApp();
    const response = await app.fetch(new Request("https://modelping.test/api/model-catalog/sync", { method: "POST", body: "{}" }), { APP_PASSWORD: "secret", catalogStore: new MemoryStore() });
    expect(response.status).toBe(401);
  });
});
