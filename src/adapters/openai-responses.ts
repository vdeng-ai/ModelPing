import type { TestRequest, Usage } from "../types.js";
import { type Adapter, type StreamChunk, EMPTY_USAGE, buildOpenAiUrl, num } from "./base.js";

// OpenAI Responses API：/v1/responses，Bearer 认证。
// 输入用 `input` 字段，输出在 output[].content[].text，usage 为 input/output_tokens。
// 流式为带 type 的语义事件（response.output_text.delta / response.completed）。
export const openaiResponsesAdapter: Adapter = {
  protocol: "openai-responses",

  buildUrl(req: TestRequest): string {
    return buildOpenAiUrl(req, "responses");
  },

  buildHeaders(req: TestRequest): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
    };
  },

  buildBody(req: TestRequest): unknown {
    return {
      model: req.model,
      input: req.input,
      max_output_tokens: req.maxTokens,
      stream: req.stream,
    };
  },

  extractText(json: any): string {
    // 优先用便捷字段 output_text；否则遍历 output 数组拼接文本。
    if (typeof json?.output_text === "string") return json.output_text;
    const out = json?.output;
    if (Array.isArray(out)) {
      const parts: string[] = [];
      for (const item of out) {
        for (const c of item?.content ?? []) {
          if (typeof c?.text === "string") parts.push(c.text);
        }
      }
      return parts.join("");
    }
    return "";
  },

  parseUsage(json: any): Usage {
    const u = json?.usage;
    if (!u) return { ...EMPTY_USAGE };
    return {
      inputTokens: num(u.input_tokens),
      outputTokens: num(u.output_tokens),
      totalTokens: num(u.total_tokens),
    };
  },

  parseStreamChunk(payload: any): StreamChunk | null {
    const t = payload?.type;
    if (t === "response.output_text.delta" && typeof payload.delta === "string") {
      return { text: payload.delta };
    }
    // 完成事件携带最终 usage。
    if ((t === "response.completed" || t === "response.incomplete") && payload?.response?.usage) {
      const u = payload.response.usage;
      return {
        usage: {
          inputTokens: num(u.input_tokens),
          outputTokens: num(u.output_tokens),
          totalTokens: num(u.total_tokens),
        },
      };
    }
    return null;
  },
};
