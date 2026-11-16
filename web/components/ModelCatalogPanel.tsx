import { useEffect, useMemo, useState } from "preact/hooks";
import { Check, Download, RefreshCw, Search } from "lucide-preact";
import type { ProviderPreset } from "../lib/types.js";
import type { CatalogProvider } from "../lib/api.js";
import type { ModelCatalogState } from "./useModelCatalog.js";
import { useI18n } from "../lib/i18n.js";
import "./ModelCatalogPanel.css";

export function ModelCatalogPanel({ providers, busy, disableAdd = false, onAdd, state, activeProviderId }: {
  state: ModelCatalogState;
  activeProviderId: string;
  providers: ProviderPreset[];
  busy: boolean;
  disableAdd?: boolean;
  onAdd: (providerId: string, models: { id: string; label: string }[], source: CatalogProvider) => void;
}) {
  const { t, lang } = useI18n();
  const catalog = state.data ?? { providers: [], updatedAt: null };
  const { loading, syncing, error } = state;
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState(providers.some((p) => p.id === activeProviderId) ? activeProviderId : (providers[0]?.id ?? "__new__"));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { void state.load(); }, [state.load]);
  useEffect(() => {
    setSourceId((current) => state.data?.providers.some((p) => p.id === current) ? current : (state.data?.providers[0]?.id ?? ""));
    setSelected(new Set());
  }, [state.data]);
  useEffect(() => {
    if (targetId !== "__new__" && !providers.some((provider) => provider.id === targetId)) setTargetId(providers[0]?.id ?? "__new__");
  }, [providers, targetId]);

  const source = catalog.providers.find((provider) => provider.id === sourceId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (source?.models ?? []).filter((model) => `${model.id} ${model.label}`.toLowerCase().includes(q));
  }, [source, query]);
  const target = providers.find((provider) => provider.id === targetId);
  const matchedProtocol = source?.id === "anthropic"
    ? "Anthropic Messages"
    : source?.id === "google" || source?.id.startsWith("gemini")
      ? "Gemini"
      : "OpenAI Chat / Responses";
  const targetIds = new Set(target?.models.map((model) => model.id) ?? []);
  const addable = [...selected].filter((id) => !targetIds.has(id));

  const addSelected = () => {
    if (!source || (!target && targetId !== "__new__") || !addable.length) return;
    onAdd(targetId, addable.map((id) => {
      const model = source.models.find((item) => item.id === id)!;
      return { id: model.id, label: model.label };
    }), source);
    setSelected(new Set());
  };

  const updatedLabel = catalog.updatedAt
    ? new Date(catalog.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")
    : t("catalog.neverSynced");

  return (
    <section class="model-catalog-panel">
      <p class="model-catalog-updated">{updatedLabel}</p>
      <div class="model-catalog-content">
        <div class="model-catalog-intro">
          <p>{t("catalog.description")}</p>
          <button class="primary" type="button" disabled={syncing || busy || loading} onClick={() => void state.sync()}>
            <RefreshCw size={16} class={syncing ? "spin" : ""} />
            {syncing ? t("catalog.syncing") : t("catalog.sync")}
          </button>
        </div>
        <div class="model-catalog-meta"><span>{t("catalog.source")}: <a href="https://models.dev/" target="_blank" rel="noreferrer">Models.dev</a></span><span>{loading ? t("common.loading") : t("catalog.manualOnly")}</span></div>
        {error ? <div class="model-catalog-error" role="alert">{error}{!state.data ? <button type="button" onClick={() => void state.load()}>{t("app.retry")}</button> : null}</div> : null}
        {catalog.providers.length ? (
          <>
            <div class="model-catalog-controls">
              <label class="field"><span>{t("catalog.sourceProvider")}</span><select value={sourceId} onChange={(e) => { setSourceId(e.currentTarget.value); setSelected(new Set()); }}>
                <option value="">{t("catalog.chooseProvider")}</option>
                {catalog.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.models.length})</option>)}
              </select></label>
              <label class="field"><span>{t("catalog.targetProvider")}</span><select value={targetId} disabled={busy} onChange={(e) => setTargetId(e.currentTarget.value)}>
                <option value="__new__">{t("catalog.createProvider")}</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select></label>
            </div>
            {source ? (
              <>
                <div class="model-catalog-protocol"><span>{t("catalog.protocolMatch")}</span><strong>{matchedProtocol}</strong></div>
                <label class="search-control model-catalog-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label={t("catalog.searchModels")} value={query} placeholder={t("catalog.searchModels")} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
                <div class="model-catalog-list">
                  {filtered.map((model) => {
                    const exists = targetIds.has(model.id);
                    return <label class={"model-catalog-item" + (exists ? " exists" : "")} key={model.id}>
                      <input type="checkbox" checked={selected.has(model.id)} disabled={exists || busy} onChange={(e) => { const checked = e.currentTarget.checked; setSelected((current) => { const next = new Set(current); if (checked) next.add(model.id); else next.delete(model.id); return next; }); }}/>
                      <span class="model-catalog-item-main"><strong>{model.label}</strong><code>{model.id}</code></span>
                      <span class="model-catalog-item-meta">{model.context ? `${(model.context / 1000).toLocaleString()}K` : ""}{exists ? <span class="model-catalog-existing"><Check size={13}/>{t("catalog.alreadyAdded")}</span> : null}</span>
                    </label>;
                  })}
                  {!filtered.length ? <p class="empty">{t("ui.noMatch")}</p> : null}
                </div>
                <div class="model-catalog-footer"><span>{t("catalog.selected", { count: addable.length })}</span><button class="primary" type="button" disabled={!addable.length || busy || disableAdd || (targetId === "__new__" && !source.baseUrl)} onClick={addSelected}><Download size={15}/>{t(targetId === "__new__" ? "catalog.createAndAdd" : "catalog.addSelected")}</button></div>
              </>
            ) : null}
          </>
        ) : <p class="model-catalog-empty">{loading ? t("common.loading") : t("catalog.empty")}</p>}
      </div>
    </section>
  );
}
