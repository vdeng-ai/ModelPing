export interface CatalogModel {
  id: string;
  label: string;
  releaseDate: string | null;
  context: number | null;
  modalities: string[];
}

export interface CatalogProvider {
  id: string;
  name: string;
  baseUrl: string;
  docs: string;
  models: CatalogModel[];
}

export function normalizeExternalCatalog(raw: unknown): CatalogProvider[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Unexpected catalog response");
  return Object.entries(raw as Record<string, any>)
    .filter(([id, value]) => /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id) && value && typeof value === "object" && value.models && typeof value.models === "object")
    .map(([id, value]) => ({
      id,
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : id,
      baseUrl: typeof value.api === "string" && /^https:\/\//i.test(value.api) ? value.api : "",
      docs: typeof value.doc === "string" && /^https:\/\//i.test(value.doc) ? value.doc : "",
      models: Object.entries(value.models as Record<string, any>)
        .filter(([modelId, model]) => typeof modelId === "string" && modelId.trim() && model && typeof model === "object" && model.status !== "deprecated" && !model.deleted)
        .map(([modelId, model]) => ({
          id: modelId,
          label: typeof model.name === "string" && model.name.trim() ? model.name.trim() : modelId,
          releaseDate: typeof model.release_date === "string" ? model.release_date : null,
          context: Number.isFinite(model.limit?.context) ? model.limit.context : null,
          modalities: Array.isArray(model.modalities?.input) ? model.modalities.input.filter((v: unknown) => typeof v === "string").slice(0, 5) : [],
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter((provider) => provider.models.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
