import type { SettingsStore } from "./types.js";

// Cloudflare Workers 驱动：用 KV 命名空间绑定存储。零新依赖。
// 绑定在 wrangler.toml 配置：[[kv_namespaces]] binding = "SETTINGS_KV"。
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const KEY = "presets";

export class CfKvStore implements SettingsStore {
  constructor(private readonly kv: KVNamespace) {}

  get(): Promise<string | null> {
    return this.kv.get(KEY);
  }

  put(value: string): Promise<void> {
    return this.kv.put(KEY, value);
  }
}
