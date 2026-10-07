import { describe, it, expect } from "vitest";
import { openaiChatAdapter } from "./openai-chat.js";
import { openaiResponsesAdapter } from "./openai-responses.js";
import { geminiAdapter } from "./gemini.js";
import { anthropicAdapter } from "./anthropic.js";

describe("openaiChatAdapter", () => {
  it("extracts text and usage", () => {
    const json = {
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    };
    expect(openaiChatAdapter.extractText(json)).toBe("hello");
    expect(openaiChatAdapter.parseUsage(json)).toEqual({ inputTokens: 3, outputTokens: 5, totalTokens: 8 });
  });

  it("parses stream delta and usage chunks", () => {
    expect(openaiChatAdapter.parseStreamChunk({ choices: [{ delta: { content: "hi" } }] })).toEqual({ text: "hi" });
    expect(openaiChatAdapter.parseStreamChunk({ usage: { prompt_tokens: 1 } })?.usage?.inputTokens).toBe(1);
    expect(openaiChatAdapter.parseStreamChunk({ choices: [{ delta: {} }] })).toBeNull();
    expect(openaiChatAdapter.isStreamDoneData?.("[DONE]")).toBe(true);
    expect(openaiChatAdapter.isStreamDoneData?.('{"done":true}')).toBe(false);
  });
});

describe("openaiResponsesAdapter", () => {
  it("prefers output_text, falls back to output array", () => {
    expect(openaiResponsesAdapter.extractText({ output_text: "quick" })).toBe("quick");
    expect(
      openaiResponsesAdapter.extractText({ output: [{ content: [{ text: "a" }, { text: "b" }] }] }),
    ).toBe("ab");
  });

  it("parses semantic stream events", () => {
    expect(openaiResponsesAdapter.parseStreamChunk({ type: "response.output_text.delta", delta: "x" })).toEqual({
      text: "x",
    });
    const done = openaiResponsesAdapter.parseStreamChunk({
      type: "response.completed",
      response: { usage: { input_tokens: 2, output_tokens: 4, total_tokens: 6 } },
    });
    expect(done?.usage).toEqual({ inputTokens: 2, outputTokens: 4, totalTokens: 6 });
    expect(done?.terminal).toEqual({ state: "completed" });

    const failed = openaiResponsesAdapter.parseStreamChunk({
      type: "response.failed",
      response: { error: { message: "boom" } },
    });
    expect(failed?.terminal).toEqual({ state: "failed", error: "Responses API failed: boom" });

    const incomplete = openaiResponsesAdapter.parseStreamChunk({
      type: "response.incomplete",
      response: { incomplete_details: { reason: "max_output_tokens" } },
    });
    expect(incomplete?.terminal).toEqual({
      state: "incomplete",
      error: "Responses API incomplete: max_output_tokens",
    });
    expect(openaiResponsesAdapter.parseStreamChunk({ type: "response.created" })).toBeNull();
  });
});

describe("geminiAdapter", () => {
  it("extracts text from candidate parts", () => {
    expect(
      geminiAdapter.extractText({ candidates: [{ content: { parts: [{ text: "g1" }, { text: "g2" }] } }] }),
    ).toBe("g1g2");
  });

  it("parses usageMetadata", () => {
    expect(
      geminiAdapter.parseUsage({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 } }),
    ).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it("marks a finishReason as stream completion", () => {
    expect(
      geminiAdapter.parseStreamChunk({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "done" }] } }] })
        ?.terminal,
    ).toEqual({ state: "completed" });
  });
});

describe("anthropicAdapter", () => {
  it("joins text blocks", () => {
    expect(
      anthropicAdapter.extractText({ content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] }),
    ).toBe("ab");
  });

  it("derives total from input+output", () => {
    expect(anthropicAdapter.parseUsage({ usage: { input_tokens: 4, output_tokens: 6 } })).toEqual({
      inputTokens: 4,
      outputTokens: 6,
      totalTokens: 10,
    });
  });

  it("parses message_start / content_block_delta / message_delta", () => {
    expect(anthropicAdapter.parseStreamChunk({ type: "content_block_delta", delta: { text: "z" } })).toEqual({
      text: "z",
    });
    expect(
      anthropicAdapter.parseStreamChunk({ type: "message_start", message: { usage: { input_tokens: 5 } } })?.usage
        ?.inputTokens,
    ).toBe(5);
    expect(
      anthropicAdapter.parseStreamChunk({ type: "message_delta", usage: { output_tokens: 9 } })?.usage?.outputTokens,
    ).toBe(9);
    expect(anthropicAdapter.parseStreamChunk({ type: "message_stop" })?.terminal).toEqual({ state: "completed" });
    expect(
      anthropicAdapter.parseStreamChunk({ type: "error", error: { message: "bad stream" } })?.terminal,
    ).toEqual({ state: "failed", error: "Anthropic stream error: bad stream" });
  });
});
