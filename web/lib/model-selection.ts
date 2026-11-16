import type { CatalogProvider } from "./api.js";
import { CUSTOM_PROVIDER_ID } from "./presets.js";
import { freshProbes, nextModelRowKey, type ModelRow } from "./model-rows.js";

export interface ModelOption {
  id: string;
  label: string;
  rowKey?: string;
  sources: string[];
  searchText: string;
}

export function modelsForConnection(rows: ModelRow[], providerId: string): ModelRow[] {
  return rows.filter((row) => providerId === CUSTOM_PROVIDER_ID || row.custom || providerId in row.modelByProvider);
}

export function buildModelOptions(rows: ModelRow[], providerId: string, catalog: CatalogProvider[]): ModelOption[] {
  const options = new Map<string, ModelOption>();
  for (const row of modelsForConnection(rows, providerId)) {
    const id = row.modelByProvider[providerId] ?? row.label;
    if (!options.has(id)) options.set(id, { id, label: row.label, rowKey: row.key, sources: [], searchText: `${id} ${row.label}` });
  }
  for (const provider of catalog) {
    for (const model of provider.models) {
      const existing = options.get(model.id);
      if (existing) {
        if (!existing.sources.includes(provider.name)) existing.sources.push(provider.name);
        existing.searchText += ` ${model.label} ${provider.id} ${provider.name}`;
      } else {
        options.set(model.id, { id: model.id, label: model.label, sources: [provider.name], searchText: `${model.id} ${model.label} ${provider.id} ${provider.name}` });
      }
    }
  }
  return [...options.values()].map((option) => ({ ...option, searchText: option.searchText.toLowerCase() }));
}

export function searchModelOptions(options: ModelOption[], query: string, limit = 60) {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const matches = options.filter((option) => terms.every((term) => option.searchText.includes(term)));
  const rank = (option: ModelOption) => option.id.toLowerCase() === q ? 0
    : option.label.toLowerCase() === q ? 1 : option.id.toLowerCase().startsWith(q) ? 2 : 3;
  if (q) matches.sort((a, b) => rank(a) - rank(b) || Number(!a.rowKey) - Number(!b.rowKey));
  return { options: matches.slice(0, limit), total: matches.length };
}

/** Select the request ID, never a catalog display label or another provider's alias. */
export function selectModelById(rows: ModelRow[], providerId: string, id: string, makeKey = nextModelRowKey) {
  const model = id.trim();
  const existing = modelsForConnection(rows, providerId).find((row) => (row.modelByProvider[providerId] ?? row.label) === model);
  if (!model) return { rows, key: "" };
  const selected: ModelRow = existing ?? { key: makeKey(), label: model, modelByProvider: {}, custom: true, checked: true, probes: freshProbes() };
  const next = existing ? rows : [...rows, selected];
  return { key: selected.key, rows: next.map((row) => ({ ...row, checked: row.key === selected.key })) };
}
