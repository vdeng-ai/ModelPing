import type { Protocol } from "./types.js";

export const PROTOCOLS = ["openai-chat", "openai-responses", "gemini", "anthropic"] as const satisfies readonly Protocol[];
export const OPENAI_COMPAT_PROTOCOLS = ["openai-chat", "openai-responses"] as const satisfies readonly Protocol[];

export function protocolOf(value: unknown): Protocol | null {
  const protocol = String(value ?? "").trim();
  return (PROTOCOLS as readonly string[]).includes(protocol) ? protocol as Protocol : null;
}

export function protocolsForModelName(name: string): Protocol[] {
  const n = name.toLowerCase();
  if (n.includes("claude")) return ["anthropic"];
  if (n.includes("gemini")) return ["gemini"];
  return [...OPENAI_COMPAT_PROTOCOLS];
}

export function protocolsForProvider(providerId: string | null | undefined, modelName: string): Protocol[] {
  const id = String(providerId ?? "").trim().toLowerCase();
  if (id === "anthropic") return ["anthropic"];
  if (id === "gemini") return ["gemini"];
  if (!id || id === "custom") return protocolsForModelName(modelName);
  return [...OPENAI_COMPAT_PROTOCOLS];
}
