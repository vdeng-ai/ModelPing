import type { TestRequest, Usage } from "../types.js";
import { type Adapter, type StreamChunk, EMPTY_USAGE, buildOpenAiUrl, num } from "./base.js";

// OpenAI Chat Completions：/v1/chat/completions，Bearer 认证。
// 流式需 stream_options.include_usage 才会在末包返回 usage。
export const openaiChatAdapter: Adapter = {
  protocol: "openai-chat",

  buildUrl(req: TestRequest): string {
    return buildOpenAiUrl(req, "chat/completions");
  },

  buildHeaders(req: TestRequest): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
    };
  },

  buildBody(req: TestRequest): unknown {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [{ role: "user", content: req.input }],
      max_tokens: req.maxTokens,
      stream: req.stream,
    };
    if (req.stream) body.stream_options = { include_usage: true };
    return body;
  },

  extractText(json: any): string {
    return json?.choices?.[0]?.message?.content ?? "";
  },

  parseUsage(json: any): Usage {
    const u = json?.usage;
    if (!u) return { ...EMPTY_USAGE };
    return {
      inputTokens: num(u.prompt_tokens),
      outputTokens: num(u.completion_tokens),
      totalTokens: num(u.total_tokens),
    };
  },

  parseStreamChunk(payload: any): StreamChunk | null {
    const chunk: StreamChunk = {};
    const delta = payload?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length) chunk.text = delta;
    const u = payload?.usage;
    if (u) {
      chunk.usage = {
        inputTokens: num(u.prompt_tokens),
        outputTokens: num(u.completion_tokens),
        totalTokens: num(u.total_tokens),
      };
    }
    return chunk.text || chunk.usage ? chunk : null;
  },
};
