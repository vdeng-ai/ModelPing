// 生成并唤起 cc-switch 的 deeplink（ccswitch://v1/import），把测试通过的模型导入为 provider。
// 协议参考：farion1231/cc-switch docs/user-manual/en/5-faq/5.3-deeplink.md
import type { Protocol } from "./types.js";

// cc-switch 支持的目标 app（CLI 工具）。
export type CcApp = "claude" | "codex" | "gemini" | "opencode" | "openclaw";

export const CC_APPS: CcApp[] = ["claude", "codex", "gemini", "opencode", "openclaw"];

export const APP_LABELS: Record<CcApp, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

// 测试协议 → 默认目标 app。OpenAI 兼容协议默认归到 Codex，用户可在下拉里改。
export const PROTOCOL_TO_APP: Record<Protocol, CcApp> = {
  anthropic: "claude",
  gemini: "gemini",
  "openai-chat": "codex",
  "openai-responses": "codex",
};

export interface DeepLinkParams {
  app: CcApp;
  name: string;
  endpoint: string;
  apiKey: string;
  model?: string;
}

export function buildDeepLink({ app, name, endpoint, apiKey, model }: DeepLinkParams): string {
  const params = new URLSearchParams({ resource: "provider", app, name, endpoint, apiKey });
  if (model) params.set("model", model);
  return `ccswitch://v1/import?${params.toString()}`;
}

// 唤起本地 cc-switch：用隐藏 <a> 触发协议，避免卸载 SPA。未安装时浏览器静默失败。
export function launchCcSwitch(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
