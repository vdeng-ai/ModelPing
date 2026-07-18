import { sortByDisplayText } from "./alphabetical-sort.js";

export type ModelListEntry<T> =
  | { kind: "group"; key: string; label: string; models: T[] }
  | { kind: "model"; model: T };

/**
 * Return the stable family name before a numeric version suffix.
 * Single-letter release markers such as v4, M2.7, and k2.6 are excluded.
 */
export function modelFamilyPrefix(label: string): string | null {
  const value = label.trim();
  const versionIndex = value.search(/\d/);
  if (versionIndex <= 0) return null;

  let prefix = value.slice(0, versionIndex);
  prefix = prefix.replace(/[-_.:/][a-z]$/i, "");
  prefix = prefix.replace(/[-_.:/\s]+$/, "").trim();
  return prefix || null;
}

/** Build a naturally sorted list containing groups and standalone models. */
export function groupModelsByFamily<T>(models: readonly T[], getLabel: (model: T) => string): ModelListEntry<T>[] {
  const sorted = sortByDisplayText(models, getLabel);
  const families = new Map<string, { label: string; models: T[] }>();

  for (const model of sorted) {
    const prefix = modelFamilyPrefix(getLabel(model));
    if (!prefix) continue;
    const key = prefix.toLocaleLowerCase("en");
    const family = families.get(key);
    if (family) family.models.push(model);
    else families.set(key, { label: prefix, models: [model] });
  }

  const entries: ModelListEntry<T>[] = [];
  const emittedGroups = new Set<string>();
  for (const model of sorted) {
    const prefix = modelFamilyPrefix(getLabel(model));
    const key = prefix?.toLocaleLowerCase("en") ?? null;
    const family = key ? families.get(key) : undefined;
    if (!key || !family || family.models.length < 2) {
      entries.push({ kind: "model", model });
    } else if (!emittedGroups.has(key)) {
      emittedGroups.add(key);
      entries.push({ kind: "group", key, label: family.label, models: family.models });
    }
  }

  return sortByDisplayText(entries, (entry) => (entry.kind === "group" ? entry.label : getLabel(entry.model)));
}
