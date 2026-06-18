import { list, put } from "@vercel/blob";
import type { SettingsStore } from "./types.js";

// Vercel 驱动：用 Vercel Blob 存单个 JSON 文件。
// 需环境变量 BLOB_READ_WRITE_TOKEN（Vercel 项目接入 Blob 后自动注入）。
// 固定 pathname（addRandomSuffix:false）+ allowOverwrite，读时按前缀 list 再 fetch。
const PATHNAME = "settings/presets.json";

export class VercelBlobStore implements SettingsStore {
  constructor(private readonly token?: string) {}

  async get(): Promise<string | null> {
    const { blobs } = await list({ prefix: PATHNAME, token: this.token });
    const hit = blobs.find((b) => b.pathname === PATHNAME);
    if (!hit) return null;
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.text();
  }

  async put(value: string): Promise<void> {
    await put(PATHNAME, value, {
      access: "public",
      token: this.token,
      contentType: "application/json",
      addRandomSuffix: false,
    });
  }
}
