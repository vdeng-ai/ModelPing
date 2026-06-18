import type { TestRequest, Usage } from "../types.js";
import { type Adapter, type StreamChunk, EMPTY_USAGE, buildGeminiUrl, num } from "./base.js";

// Google Gemini native generateContent：
//   非流式 /v1beta/models/{model}:generateContent
//   流式   /v1beta/models/{model}:streamGenerateContent?alt=sse
// 认证用 x-goog-api-key 头（也支持 ?key=，这里用头更干净）。
export const geminiAdapter: Adapter = {
  protocol: "gemini",

  buildUrl(req: TestRequest): string {
    return buildGeminiUrl(req);
  },

  buildHeaders(req: TestRequest): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-goog-api-key": req.apiKey,
    };
  },

  buildBody(req: TestRequest): unknown {
    return {
      contents: [{ role: "user", parts: [{ text: req.input }] }],
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
  },

  extractText(json: any): string {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  },

  parseUsage(json: any): Usage {
    const u = json?.usageMetadata;
    if (!u) return { ...EMPTY_USAGE };
    return {
      inputTokens: num(u.promptTokenCount),
      outputTokens: num(u.candidatesTokenCount),
      totalTokens: num(u.totalTokenCount),
    };
  },

  parseStreamChunk(payload: any): StreamChunk | null {
    const chunk: StreamChunk = {};
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
      if (text) chunk.text = text;
    }
    const u = payload?.usageMetadata;
    if (u) {
      chunk.usage = {
        inputTokens: num(u.promptTokenCount),
        outputTokens: num(u.candidatesTokenCount),
        totalTokens: num(u.totalTokenCount),
      };
    }
    return chunk.text || chunk.usage ? chunk : null;
  },
};
