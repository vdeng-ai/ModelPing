// 设置持久化的极简存储接口。只存一个 JSON blob（presets），读多写少。
// 三种部署各有一个实现：file（Node 自托管）、cf-kv（Cloudflare）、vercel（@vercel/blob）。
export interface SettingsStore {
  get(): Promise<string | null>;   // 返回 presets JSON 字符串；无数据返回 null。
  put(value: string): Promise<void>;
}
