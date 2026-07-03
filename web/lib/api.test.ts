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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api auth failures", () => {
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
