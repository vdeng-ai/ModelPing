import type { SettingsStore } from "./types.js";

export type { SettingsStore } from "./types.js";

// 驱动选择的环境输入。各入口按自身可用的绑定/环境变量填充。
export interface StoreEnv {
  STORAGE_DRIVER?: string;            // 显式覆盖：file | cf-kv | vercel | none
  SETTINGS_FILE?: string;             // file 驱动的路径，缺省 ./web/public/presets.json
  SETTINGS_KV?: unknown;              // Cloudflare KV 绑定
  BLOB_READ_WRITE_TOKEN?: string;     // Vercel Blob token
}

// Node 自托管：UI 修改与手改文件统一指向同一份 presets，改即生效（也是 /presets.json 的源）。
export const DEFAULT_SETTINGS_FILE = "./web/public/presets.json";

// 按优先级选择驱动；都不满足返回 null（前端退回纯本地模式）。
// 驱动模块用动态 import，避免把 node:fs / @vercel/blob 打进不相关的部署包。
export async function createStore(env: StoreEnv): Promise<SettingsStore | null> {
  const driver = (env.STORAGE_DRIVER ?? "").trim().toLowerCase();

  if (driver === "none") return null;

  if (driver === "cf-kv" || (!driver && env.SETTINGS_KV)) {
    if (!env.SETTINGS_KV) throw new Error("STORAGE_DRIVER=cf-kv 但缺少 SETTINGS_KV 绑定");
    const { CfKvStore } = await import("./cf-kv.js");
    return new CfKvStore(env.SETTINGS_KV as any);
  }

  if (driver === "vercel" || (!driver && env.BLOB_READ_WRITE_TOKEN)) {
    const { VercelBlobStore } = await import("./vercel.js");
    return new VercelBlobStore(env.BLOB_READ_WRITE_TOKEN);
  }

  if (driver === "file" || !driver) {
    const { FileStore } = await import("./file.js");
    return new FileStore(env.SETTINGS_FILE || DEFAULT_SETTINGS_FILE);
  }

  throw new Error(`未知 STORAGE_DRIVER：${driver}`);
}
