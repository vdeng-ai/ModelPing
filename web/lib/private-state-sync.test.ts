import { describe, expect, it } from "vitest";
import type { HistoryEntry, PrivateState } from "./types.js";
import { emptyPrivateState } from "../../src/private-state.js";
import {
  hasLegacyPrivateState,
  mergePrivateState,
  privateStateForScope,
  serializePrivateStateForScope,
  withoutHistory,
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

    // History is session-only and never restored.
    expect(merged.historyPersist).toBe(false);
    expect(merged.history).toEqual([]);
    expect(merged.conn?.baseUrl).toBe("https://api.example.com");
    expect(merged.config?.timeoutMs).toBe(1000);
    expect(merged.customModelsPersist).toBe(false);
    expect(merged.customModels).toEqual([]);
  });

  it("keeps config/status/custom models but clears history outside full scope", () => {
    const merged = mergePrivateState(state({
      history: [historyEntry],
      historyPersist: true,
      customModelsPersist: true,
      customModels: ["custom-a"],
    }), {
      historyPersist: true,
      history: [historyEntry],
    }, "config");

    expect(merged.historyPersist).toBe(false);
    expect(merged.history).toEqual([]);
    expect(merged.customModelsPersist).toBe(true);
    expect(merged.customModels).toEqual(["custom-a"]);
  });

  it("never restores history from server or legacy", () => {
    const serverWithHistory = state({ history: [historyEntry], historyPersist: true });
    const serverWithoutHistory = state({ history: [] });
    const legacyEntry = { ...historyEntry, id: "legacy" };

    expect(mergePrivateState(serverWithHistory, { history: [legacyEntry] }, "full").history).toEqual([]);
    expect(mergePrivateState(serverWithoutHistory, { history: [legacyEntry] }, "full").history).toEqual([]);
    expect(mergePrivateState(serverWithHistory, {}, "full").historyPersist).toBe(false);
  });

  it("loads custom models regardless of customModelsPersist flag", () => {
    const merged = mergePrivateState(state({
      customModelsPersist: false,
      customModels: ["a", "b"],
    }), {}, "full");
    expect(merged.customModels).toEqual(["a", "b"]);
    expect(merged.customModelsPersist).toBe(true);
  });

  it("serializes scope-cropped state with history always empty", () => {
    const raw = state({ history: [historyEntry], historyPersist: true });
    const scoped = privateStateForScope(raw, "full");

    expect(scoped.historyPersist).toBe(false);
    expect(scoped.history).toEqual([]);
    expect(JSON.parse(serializePrivateStateForScope(raw, "config")).history).toEqual([]);
  });

  it("withoutHistory is idempotent when already empty", () => {
    const empty = state({ historyPersist: false, history: [] });
    expect(withoutHistory(empty)).toBe(empty);
    const dirty = state({ historyPersist: true, history: [historyEntry] });
    expect(withoutHistory(dirty)).toMatchObject({ historyPersist: false, history: [] });
  });

  it("detects whether legacy data exists", () => {
    expect(hasLegacyPrivateState({})).toBe(false);
    expect(hasLegacyPrivateState({ historyPersist: true })).toBe(true);
  });
});
