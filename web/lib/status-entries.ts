import type { StatusEntry } from "./types.js";

export function statusEntryKey(entry: Pick<StatusEntry, "baseUrl" | "isFullUrl" | "protocol" | "model">): string {
  const urlMode = entry.isFullUrl ? "full" : "base";
  return `${entry.baseUrl.trim()}|${urlMode}|${entry.protocol}|${entry.model.trim()}`;
}
