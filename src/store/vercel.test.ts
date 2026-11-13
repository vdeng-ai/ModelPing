import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "./index.js";
import { VercelBlobStore } from "./vercel.js";

// Exercise the real Blob SDK against a loopback-only API, not a mocked put().
// This catches SDK wire-format changes without credentials or cloud writes.
const TOKEN = "vercel_blob_rw_teststore_test-token";
const values = new Map<string, string>();
const requests: { method: string; headers: IncomingHttpHeaders; pathname: string; body: string }[] = [];
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", origin);
      const pathname = url.searchParams.get("pathname") ?? "";
      const metadata = (name: string) => ({
        pathname: name,
        url: `${origin}/content?pathname=${encodeURIComponent(name)}`,
        downloadUrl: `${origin}/content?pathname=${encodeURIComponent(name)}`,
        contentType: "application/json",
        contentDisposition: "inline",
        size: Buffer.byteLength(values.get(name) ?? ""),
        uploadedAt: new Date().toISOString(),
        etag: '"test-etag"',
      });

      // Public blob downloads use the URL returned by list(), without a token.
      if (url.pathname === "/content") {
        const value = values.get(pathname);
        res.writeHead(value === undefined ? 404 : 200, { "content-type": "application/json" });
        res.end(value);
        return;
      }

      let body = "";
      req.setEncoding("utf8");
      for await (const chunk of req) body += chunk;
      requests.push({ method: req.method ?? "GET", headers: req.headers, pathname, body });
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: { code: "forbidden", message: "Invalid test token" } }));
        return;
      }

      if (req.method === "PUT") {
        // Reproduce the SDK >= 1 service contract: overwriting is opt-in.
        if (values.has(pathname) && req.headers["x-allow-overwrite"] !== "1") {
          res.writeHead(400);
          res.end(JSON.stringify({ error: { code: "blob_already_exists" } }));
          return;
        }
        values.set(pathname, body);
        res.end(JSON.stringify(metadata(pathname)));
        return;
      }

      const prefix = url.searchParams.get("prefix") ?? "";
      res.end(JSON.stringify({
        blobs: [...values.keys()].filter((name) => name.startsWith(prefix)).map(metadata),
        hasMore: false,
      }));
    } catch {
      res.writeHead(500);
      res.end("Local Blob fixture failed");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv("VERCEL_BLOB_API_URL", origin);
});

beforeEach(() => {
  values.clear();
  requests.length = 0;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

describe("VercelBlobStore SDK compatibility", () => {
  it.each([
    ["presets", "settings/presets.json"],
    ["private", "settings/private-state.enc"],
  ] as const)("creates, overwrites and reads the fixed %s path", async (name, pathname) => {
    const store = await createStore({ STORAGE_DRIVER: "vercel", BLOB_READ_WRITE_TOKEN: TOKEN }, name);
    expect(store).toBeInstanceOf(VercelBlobStore);
    const first = name === "presets" ? '{"providers":[]}' : "encrypted-test-state-1";
    const second = name === "presets" ? '{"providers":[{"id":"demo"}]}' : "encrypted-test-state-2";

    await store!.put(first);
    await store!.put(second);
    await expect(store!.get()).resolves.toBe(second);
    expect([...values.keys()]).toEqual([pathname]);

    const writes = requests.filter((request) => request.method === "PUT");
    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(write.pathname).toBe(pathname);
      expect(write.headers).toMatchObject({
        authorization: `Bearer ${TOKEN}`,
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "x-content-type": "application/json",
        "x-vercel-blob-access": "public",
      });
    }
    expect(writes.map((write) => write.body)).toEqual([first, second]);
  });

  it("does not mistake a shared-prefix backup for the requested blob", async () => {
    const store = new VercelBlobStore(TOKEN);
    values.set("settings/presets.json.backup", "backup");
    await expect(store.get()).resolves.toBeNull();
    values.set("settings/presets.json", "current");
    await expect(store.get()).resolves.toBe("current");
  });

  it("returns null for a missing blob", async () => {
    await expect(new VercelBlobStore(TOKEN).get()).resolves.toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("propagates SDK authorization failures instead of reporting a successful save", async () => {
    const store = new VercelBlobStore("vercel_blob_rw_teststore_invalid");
    await expect(store.put("must-not-be-written")).rejects.toThrow();
    expect(values.size).toBe(0);
    expect(requests).toHaveLength(1);
  });
});
