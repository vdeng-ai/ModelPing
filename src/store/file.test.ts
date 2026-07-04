import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { FileStore } from "./file.js";

let tempDirs: string[] = [];

async function tempPath(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "modelping-file-store-"));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("FileStore", () => {
  it("returns null when the file does not exist", async () => {
    const store = new FileStore(await tempPath("missing.json"));

    await expect(store.get()).resolves.toBeNull();
  });

  it("writes and reads a value", async () => {
    const path = await tempPath("settings.json");
    const store = new FileStore(path);

    await store.put(JSON.stringify({ ok: true }));

    await expect(store.get()).resolves.toBe('{"ok":true}');
  });

  it("handles concurrent writes without leaving a partial file", async () => {
    const path = await tempPath("settings.json");
    const store = new FileStore(path);
    const values = Array.from({ length: 20 }, (_, i) => JSON.stringify({ i, payload: "x".repeat(1000) }));

    await Promise.all(values.map((value) => store.put(value)));

    const final = await readFile(path, "utf-8");
    expect(values).toContain(final);
    expect(() => JSON.parse(final)).not.toThrow();
  });
});
