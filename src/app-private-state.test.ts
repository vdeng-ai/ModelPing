import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { SettingsStore } from "./store/index.js";

class MemoryStore implements SettingsStore {
  value: string | null = null;
  get(): Promise<string | null> {
    return Promise.resolve(this.value);
  }
  put(value: string): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }
}

const state = {
  v: 1,
  historyPersist: false,
  history: [],
  conn: null,
  config: null,
  customModelsPersist: false,
  customModels: [],
  statusEntries: [],
  updatedAt: 0,
};

function putRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://x.test/api/private-state", {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(state),
  });
}

describe("private-state encryption mode", () => {
  it("uses the fast v2 format for dedicated PRIVATE_STATE_SECRET and can read it back", async () => {
    const app = createApp();
    const store = new MemoryStore();
    const env = { privateStore: store, PRIVATE_STATE_SECRET: "dedicated-random-secret" };

    const put = await app.fetch(putRequest(), env);
    expect(put.status).toBe(200);
    expect(JSON.parse(store.value ?? "{}")).toMatchObject({ v: 2, kdf: "sha256" });

    const get = await app.fetch(new Request("http://x.test/api/private-state"), env);
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({ v: 1, history: [], statusEntries: [] });
  });

  it("keeps PBKDF2 v1 when APP_PASSWORD is the only secret source", async () => {
    const app = createApp();
    const store = new MemoryStore();
    const env = { privateStore: store, APP_PASSWORD: "human-password" };

    const put = await app.fetch(putRequest({ "x-app-password": "human-password" }), env);
    expect(put.status).toBe(200);
    const blob = JSON.parse(store.value ?? "{}") as { v?: number; iter?: number };
    expect(blob.v).toBe(1);
    expect(blob.iter).toBeGreaterThan(0);
  });
});
