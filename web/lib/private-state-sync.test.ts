import { describe, expect, it } from "vitest";
import type { HistoryEntry, PrivateState } from "./types.js";
import { emptyPrivateState } from "../../src/private-state.js";
import {
  hasLegacyPrivateState,
  mergePrivateState,
  privateStateForScope,
  serializePrivateStateForScope,
} from "./private-state-sync.js";

const historyEntry: HistoryEntry = {
  id: "h1",
  ts: 1,
  providerName: "Provider",
  protocol: "openai-chat",
  baseUrl: "https://api.example.com",
  apiKey: "sk",
  model: "m",
  modelLabel: "m",
  streamVerdict: "none",
  result: {
    ok: true,
    status: 200,
    latencyMs: 10,
    ttftMs: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    text: "ok",
    error: null,
    requestUrl: "https://api.example.com/v1/chat/completions",
    attempts: 1,
  },
};

function state(overrides: Partial<PrivateState> = {}): PrivateState {
  return {
    ...emptyPrivateState(),
    updatedAt: 123,
    ...overrides,
  };
}

describe("private-state sync helpers", () => {
  it("merges legacy private state when server state is unavailable", () => {
    const merged = mergePrivateState(null, {
      historyPersist: false,
      history: [historyEntry],
      conn: { providerId: "custom", baseUrl: "https://api.example.com", apiKey: "sk" },
      config: { timeoutMs: 1000 },
    }, "full");

    expect(merged.historyPersist).toBe(false);
    expect(merged.history).toEqual([historyEntry]);
    expect(merged.conn?.baseUrl).toBe("https://api.example.com");
    expect(merged.config?.timeoutMs).toBe(1000);
  });

  it("keeps config/status but clears history outside full scope", () => {
    const merged = mergePrivateState(state({ history: [historyEntry], historyPersist: true }), {
      historyPersist: true,
      history: [historyEntry],
    }, "config");

    expect(merged.historyPersist).toBe(false);
    expect(merged.history).toEqual([]);
  });

  it("uses legacy history only when server history is empty", () => {
    const serverWithHistory = state({ history: [historyEntry] });
    const serverWithoutHistory = state({ history: [] });
    const legacyEntry = { ...historyEntry, id: "legacy" };

    expect(mergePrivateState(serverWithHistory, { history: [legacyEntry] }, "full").history).toEqual([historyEntry]);
    expect(mergePrivateState(serverWithoutHistory, { history: [legacyEntry] }, "full").history).toEqual([legacyEntry]);
  });

  it("serializes scope-cropped state consistently", () => {
    const raw = state({ history: [historyEntry], historyPersist: true });
    const scoped = privateStateForScope(raw, "config");

    expect(scoped.historyPersist).toBe(false);
    expect(scoped.history).toEqual([]);
    expect(JSON.parse(serializePrivateStateForScope(raw, "config")).history).toEqual([]);
  });

  it("detects whether legacy data exists", () => {
    expect(hasLegacyPrivateState({})).toBe(false);
    expect(hasLegacyPrivateState({ historyPersist: true })).toBe(true);
  });
});
