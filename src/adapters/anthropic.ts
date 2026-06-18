import type { TestRequest, Usage } from "../types.js";
import { type Adapter, type StreamChunk, EMPTY_USAGE, buildAnthropicUrl, num } from "./base.js";

// Anthropic Messages：/v1/messages，x-api-key + anthropic-version 认证。
// 流式：input_tokens 在 message_start 事件，output_tokens 在 message_delta.usage 累计更新。
const ANTHROPIC_VERSION = "2023-06-01";

export const anthropicAdapter: Adapter = {
  protocol: "anthropic",

  buildUrl(req: TestRequest): string {
    return buildAnthropicUrl(req);
  },

  buildHeaders(req: TestRequest): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  },

  buildBody(req: TestRequest): unknown {
    return {
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [{ role: "user", content: req.input }],
      stream: req.stream,
    };
  },

  extractText(json: any): string {
    const blocks = json?.content;
    if (!Array.isArray(blocks)) return "";
    return blocks.map((b: any) => (b?.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  },

  parseUsage(json: any): Usage {
    const u = json?.usage;
    if (!u) return { ...EMPTY_USAGE };
    const input = num(u.input_tokens);
    const output = num(u.output_tokens);
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input != null && output != null ? input + output : null,
    };
  },

  // Anthropic 流式是带 event: 行的 SSE，runner 只把 data: 负载交给这里。
  // 通过事件内部结构判断类型：
  //   message_start  → message.usage.input_tokens
  //   content_block_delta → delta.text
  //   message_delta  → usage.output_tokens（累计值）
  parseStreamChunk(payload: any): StreamChunk | null {
    const chunk: StreamChunk = {};

    if (payload?.type === "content_block_delta") {
      const t = payload?.delta?.text;
      if (typeof t === "string" && t.length) chunk.text = t;
    }

    if (payload?.type === "message_start") {
      const u = payload?.message?.usage;
      if (u) chunk.usage = { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens), totalTokens: null };
    }

    if (payload?.type === "message_delta") {
      const u = payload?.usage;
      if (u) chunk.usage = { inputTokens: null, outputTokens: num(u.output_tokens), totalTokens: null };
    }

    return chunk.text || chunk.usage ? chunk : null;
  },
};
