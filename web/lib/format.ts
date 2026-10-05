// 小工具：格式化与剪贴板。
import type { Protocol, StreamVerdict } from "./types.js";

// 协议 → 徽章简称（一眼区分是哪个协议）。
export const PROTOCOL_LABEL: Record<Protocol, string> = {
  "openai-chat": "Chat",
  "openai-responses": "Resp",
  gemini: "Gemini",
  anthropic: "Messages",
};

// 流式结论 → 药丸内嵌图标 + 样式类；null（未探测）返回 null，不渲染图标。
export function streamGlyph(v: StreamVerdict): { char: string; cls: string } | null {
  switch (v) {
    case "stream":
      return { char: "⚡", cls: "on" };
    case "single":
      return { char: "~", cls: "single" };
    case "none":
      return { char: "⌁", cls: "off" };
    default:
      return null;
  }
}

// 延迟统一使用毫秒，方便在各行之间比较。
export function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${ms.toLocaleString("en-US", { maximumFractionDigits: 2 })} ms`;
}

// token 显示：null → —。
export function fmtTok(n: number | null): string {
  return n == null ? "—" : String(n);
}

// 时间戳 → 本地时间字符串（精简）。
export function fmtTime(ts: number, includeDate = true): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return includeDate ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}` : time;
}

// 复制到剪贴板，返回是否成功。降级到 execCommand。
export async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
