import type { ModelPreset, ProviderPreset } from "./types.js";
import { CUSTOM_PROVIDER_ID } from "./presets.js";

function cleanModelId(id: string): string {
  return id.trim();
}

/** Merge model ids into a provider's models list (dedupe by id). */
export function mergeProviderModels(provider: ProviderPreset, modelIds: string[]): ProviderPreset {
  const seen = new Set(provider.models.map((m) => m.id));
  const models: ModelPreset[] = [...provider.models];
  for (const raw of modelIds) {
    const id = cleanModelId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id });
  }
  return { ...provider, models };
}

/** Upsert a single model id onto the matching provider. No-op for custom id. */
export function upsertProviderModel(
  providers: ProviderPreset[],
  providerId: string,
  modelId: string,
): ProviderPreset[] {
  if (providerId === CUSTOM_PROVIDER_ID) return providers;
  const id = cleanModelId(modelId);
  if (!id) return providers;
  return providers.map((p) => (p.id === providerId ? mergeProviderModels(p, [id]) : p));
}

export interface RemoveProviderModelsResult {
  providers: ProviderPreset[];
  affectedProviders: Array<Pick<ProviderPreset, "id" | "name">>;
}

/** Remove every provider model that contributes to the same display row. */
export function removeProviderModelsByLabel(
  providers: ProviderPreset[],
  rawLabel: string,
): RemoveProviderModelsResult {
  const label = rawLabel.trim();
  if (!label) return { providers, affectedProviders: [] };

  const affectedProviders: Array<Pick<ProviderPreset, "id" | "name">> = [];
  let changed = false;
  const nextProviders = providers.map((provider) => {
    const models = provider.models.filter((model) => (model.label ?? model.id).trim() !== label);
    if (models.length === provider.models.length) return provider;
    changed = true;
    affectedProviders.push({ id: provider.id, name: provider.name });
    return { ...provider, models };
  });

  return {
    providers: changed ? nextProviders : providers,
    affectedProviders,
  };
}

/** Allocate provider-N style id not already used. */
export function nextProviderId(used: Iterable<string>, preferred?: string): string {
  const set = new Set(used);
  const base = (preferred ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (base && base !== CUSTOM_PROVIDER_ID && !set.has(base)) return base;
  let i = 1;
  while (set.has(`provider-${i}`)) i++;
  return `provider-${i}`;
}

export interface ConnProviderDraft {
  /** When set and exists, update that provider; otherwise create. */
  providerId?: string;
  name: string;
  id?: string;
  baseUrl: string;
  isFullUrl?: boolean;
  models: string[];
}

/** Create or update a provider from connection panel draft. */
export function upsertProviderFromConn(
  providers: ProviderPreset[],
  draft: ConnProviderDraft,
): { providers: ProviderPreset[]; providerId: string } {
  const name = draft.name.trim();
  const baseUrl = draft.baseUrl.trim();
  if (!name) throw new Error("provider name required");
  if (!baseUrl) throw new Error("baseUrl required");

  const existingId = draft.providerId && draft.providerId !== CUSTOM_PROVIDER_ID
    ? draft.providerId
    : null;
  const existing = existingId ? providers.find((p) => p.id === existingId) : undefined;

  if (existing) {
    const updated = mergeProviderModels(
      {
        ...existing,
        name: name || existing.name,
        baseUrl,
        isFullUrl: Boolean(draft.isFullUrl),
      },
      draft.models,
    );
    return {
      providers: providers.map((p) => (p.id === existing.id ? updated : p)),
      providerId: existing.id,
    };
  }

  const id = nextProviderId(
    providers.map((p) => p.id),
    draft.id || name,
  );
  const created: ProviderPreset = {
    id,
    name,
    baseUrl,
    isFullUrl: Boolean(draft.isFullUrl) || undefined,
    models: [],
  };
  const withModels = mergeProviderModels(created, draft.models);
  return {
    providers: [...providers, withModels],
    providerId: id,
  };
}
