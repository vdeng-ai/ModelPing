import type { Protocol } from "../types.js";
import type { Adapter } from "./base.js";
import { openaiChatAdapter } from "./openai-chat.js";
import { openaiResponsesAdapter } from "./openai-responses.js";
import { geminiAdapter } from "./gemini.js";
import { anthropicAdapter } from "./anthropic.js";

const REGISTRY: Record<Protocol, Adapter> = {
  "openai-chat": openaiChatAdapter,
  "openai-responses": openaiResponsesAdapter,
  gemini: geminiAdapter,
  anthropic: anthropicAdapter,
};

export function getAdapter(protocol: Protocol): Adapter | null {
  return REGISTRY[protocol] ?? null;
}

export type { Adapter, StreamChunk } from "./base.js";
