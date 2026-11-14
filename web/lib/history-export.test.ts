import { expect, it } from "vitest";
import { historyForExport } from "./history-export.js";
import type { HistoryEntry } from "./types.js";

it("omits API keys without mutating session history", () => {
  const entry: HistoryEntry = {
    id: "sample",
    ts: 1234,
    providerName: "Example",
    protocol: "openai-chat",
    baseUrl: "https://example.test/v1",
    apiKey: "test-only-secret",
    model: "model-1",
    modelLabel: "Model 1",
    streamVerdict: null,
    result: {
      ok: true,
      status: 200,
      latencyMs: 50,
      ttftMs: null,
      text: "response",
      error: null,
      attempts: 1,
      requestUrl: null,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
  };
  const exported = historyForExport([entry]);
  expect(exported[0]).not.toHaveProperty("apiKey");
  expect(exported[0].result).toEqual(entry.result);
  expect(entry.apiKey).toBe("test-only-secret");
  expect(historyForExport([])).toEqual([]);
});
