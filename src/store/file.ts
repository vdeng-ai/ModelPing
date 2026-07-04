import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SettingsStore } from "./types.js";

// Node / 自托管驱动：把 settings 持久化到本地 JSON 文件。
// 写入用「临时文件 + rename」原子替换，避免并发写出现半截内容。
export class FileStore implements SettingsStore {
  constructor(private readonly path: string) {}

  async get(): Promise<string | null> {
    try {
      return await readFile(this.path, "utf-8");
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
  }

  async put(value: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, value, "utf-8");
      await rename(tmp, this.path);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }
}
