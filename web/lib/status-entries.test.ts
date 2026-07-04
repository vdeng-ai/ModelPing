import { describe, expect, it } from "vitest";
import { statusEntryKey } from "./status-entries.js";

describe("statusEntryKey", () => {
  it("normalizes whitespace around baseUrl and model", () => {
    expect(statusEntryKey({
      baseUrl: " https://api.example.com ",
      protocol: "openai-chat",
      model: " gpt-4.1 ",
    })).toBe("https://api.example.com|base|openai-chat|gpt-4.1");
  });

  it("keeps base URL mode and full URL mode separate", () => {
    const common = {
      baseUrl: "https://api.example.com/v1/chat/completions",
      protocol: "openai-chat" as const,
      model: "m",
    };

    expect(statusEntryKey(common)).not.toBe(statusEntryKey({ ...common, isFullUrl: true }));
  });
});
