import type { PrivateState } from "./types.js";
import type { LegacyPrivateState } from "./storage.js";
import {
  applyPrivateStateScope,
  emptyPrivateState,
  type PrivateStateScope,
} from "../../src/private-state.js";

export type { PrivateStateScope };

/** Prepare private-state for sync/save. History is session-only and never written. */
export function privateStateForScope(state: PrivateState, scope: PrivateStateScope): PrivateState {
  const scoped = applyPrivateStateScope(state, scope);
  return {
    ...scoped,
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
  _scope: PrivateStateScope,
): PrivateState {
  const base = serverState ?? emptyPrivateState();
  const customModels = serverState?.customModels ?? [];

  return {
    ...base,
    // History is session-only; never restore from server or legacy storage.
    historyPersist: false,
    history: [],
    conn: serverState?.conn ?? legacy.conn ?? null,
    config: serverState?.config ?? legacy.config ?? null,
    // Keep flag for back-compat with older clients; load list regardless of flag.
    customModelsPersist: customModels.length > 0 || serverState?.customModelsPersist === true,
    customModels,
    statusEntries: serverState?.statusEntries ?? [],
  };
}

/** Force history-empty snapshot used by App before any private-state write. */
export function withoutHistory(state: PrivateState): PrivateState {
  if (!state.historyPersist && state.history.length === 0) return state;
  return { ...state, historyPersist: false, history: [] };
}
