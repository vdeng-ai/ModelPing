import { describe, expect, it } from "vitest";
import { protocolOf, protocolsForProvider } from "./protocols.js";

describe("protocol helpers", () => {
  it("normalizes protocol values", () => {
    expect(protocolOf(" openai-chat ")).toBe("openai-chat");
    expect(protocolOf("nope")).toBeNull();
  });

  it("uses native protocols for official providers", () => {
    expect(protocolsForProvider("anthropic", "gpt-5.5")).toEqual(["anthropic"]);
    expect(protocolsForProvider("gemini", "claude-sonnet-4")).toEqual(["gemini"]);
  });

  it("keeps model-name heuristics for custom providers", () => {
    expect(protocolsForProvider("custom", "claude-sonnet-4")).toEqual(["anthropic"]);
    expect(protocolsForProvider("custom", "models/gemini-3.1-pro")).toEqual(["gemini"]);
    expect(protocolsForProvider("custom", "gpt-5.5")).toEqual(["openai-chat", "openai-responses"]);
  });

  it("uses OpenAI-compatible protocols for aggregators regardless of model name", () => {
    expect(protocolsForProvider("openrouter", "anthropic/claude-sonnet-4")).toEqual(["openai-chat", "openai-responses"]);
    expect(protocolsForProvider("siliconflow", "google/gemini-3.1-pro")).toEqual(["openai-chat", "openai-responses"]);
  });
});
