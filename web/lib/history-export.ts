import type { HistoryEntry } from "./types.js";

/** Explicit connection credentials are never included in a routine download.
 * Response bodies/logs remain user data; the UI asks users to review before sharing.
 */
export function historyForExport(entries: HistoryEntry[]): Omit<HistoryEntry, "apiKey">[] {
  return entries.map(({ apiKey: _apiKey, ...entry }) => entry);
}
