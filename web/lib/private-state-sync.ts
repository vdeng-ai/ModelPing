import type { PrivateState } from "./types.js";
import type { LegacyPrivateState } from "./storage.js";
import { emptyPrivateState } from "../../src/private-state.js";

export type PrivateStateScope = "full" | "config" | "none";

export function privateStateForScope(state: PrivateState, scope: PrivateStateScope): PrivateState {
  if (scope === "full") return state;
  return {
    ...state,
    historyPersist: false,
    history: [],
  };
}

export function serializePrivateStateForScope(state: PrivateState, scope: PrivateStateScope): string {
  return JSON.stringify(privateStateForScope(state, scope));
}

export function hasLegacyPrivateState(legacy: LegacyPrivateState): boolean {
  return legacy.historyPersist !== undefined || Boolean(legacy.history) || Boolean(legacy.conn) || Boolean(legacy.config);
}

export function mergePrivateState(
  serverState: PrivateState | null,
  legacy: LegacyPrivateState,
  scope: PrivateStateScope,
): PrivateState {
  const base = serverState ?? emptyPrivateState();
  const historyCanPersist = scope === "full";

  return {
    ...base,
    historyPersist: historyCanPersist ? (serverState?.historyPersist ?? legacy.historyPersist ?? true) : false,
    history: historyCanPersist
      ? (serverState?.history?.length ? serverState.history : (legacy.history ?? []))
      : [],
    conn: serverState?.conn ?? legacy.conn ?? null,
    config: serverState?.config ?? legacy.config ?? null,
    statusEntries: serverState?.statusEntries ?? [],
  };
}
