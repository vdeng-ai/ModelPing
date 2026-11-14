import { useEffect, useMemo, useState } from "preact/hooks";
import { Check, Download, RefreshCw, Search } from "lucide-preact";
import type { ProviderPreset } from "../lib/types.js";
import { fetchModelCatalog, syncModelCatalog, type CatalogProvider } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";
import "./ModelCatalogPanel.css";

export function ModelCatalogPanel({ providers, busy, disableAdd = false, onAdd }: {
  providers: ProviderPreset[];
  busy: boolean;
  disableAdd?: boolean;
  onAdd: (providerId: string, models: { id: string; label: string }[], source: CatalogProvider) => void;
}) {
  const { t, lang } = useI18n();
  const [catalog, setCatalog] = useState<{ providers: CatalogProvider[]; updatedAt: string | null }>({ providers: [], updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState(providers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    void fetchModelCatalog().then((data) => {
      if (active) {
        setCatalog({ providers: data.providers ?? [], updatedAt: data.updatedAt });
        setSourceId(data.providers?.[0]?.id ?? "");
      }
    }).catch((e) => {
      if (active) setError(e?.message ?? String(e));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expanded]);

  useEffect(() => {
    if (!providers.some((provider) => provider.id === targetId)) setTargetId(providers[0]?.id ?? "");
  }, [providers, targetId]);

  const source = catalog.providers.find((provider) => provider.id === sourceId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (source?.models ?? []).filter((model) => `${model.id} ${model.label}`.toLowerCase().includes(q));
  }, [source, query]);
  const target = providers.find((provider) => provider.id === targetId);
  const targetIds = new Set(target?.models.map((model) => model.id) ?? []);
  const addable = [...selected].filter((id) => !targetIds.has(id));

  const sync = async () => {
    setSyncing(true);
    setError("");
    try {
      const data = await syncModelCatalog();
      setCatalog({ providers: data.providers ?? [], updatedAt: data.updatedAt });
      setSourceId((current) => data.providers.some((provider) => provider.id === current) ? current : (data.providers[0]?.id ?? ""));
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  };

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
    <details class="model-catalog-panel" onToggle={(event) => setExpanded((event.currentTarget as HTMLDetailsElement).open)}>
      <summary class="model-catalog-summary">
        <span class="model-catalog-summary-copy"><strong>{t("catalog.title")}</strong><small>{t("catalog.summary", { providers: catalog.providers.length, models: catalog.providers.reduce((sum, item) => sum + item.models.length, 0) })}</small></span>
        <span class="model-catalog-updated">{updatedLabel}</span>
      </summary>
      <div class="model-catalog-content">
        <div class="model-catalog-intro">
          <p>{t("catalog.description")}</p>
          <button class="primary" type="button" disabled={syncing || busy} onClick={() => void sync()}>
            <RefreshCw size={16} class={syncing ? "spin" : ""} />
            {syncing ? t("catalog.syncing") : t("catalog.sync")}
          </button>
        </div>
        <div class="model-catalog-meta"><span>{t("catalog.source")}: <a href="https://models.dev/" target="_blank" rel="noreferrer">Models.dev</a></span><span>{loading ? t("common.loading") : t("catalog.manualOnly")}</span></div>
        {error ? <p class="model-catalog-error" role="alert">{error}</p> : null}
        {catalog.providers.length ? (
          <>
            <div class="model-catalog-controls">
              <label class="field"><span>{t("catalog.sourceProvider")}</span><select value={sourceId} onChange={(e) => { setSourceId(e.currentTarget.value); setSelected(new Set()); }}>
                <option value="">{t("catalog.chooseProvider")}</option>
                {catalog.providers.map((provider) => <option value={provider.id}>{provider.name} ({provider.models.length})</option>)}
              </select></label>
              <label class="field"><span>{t("catalog.targetProvider")}</span><select value={targetId} disabled={busy} onChange={(e) => setTargetId(e.currentTarget.value)}>
                <option value="__new__">{t("catalog.createProvider")}</option>
                {providers.map((provider) => <option value={provider.id}>{provider.name}</option>)}
              </select></label>
            </div>
            {source ? (
              <>
                <label class="search-control model-catalog-search"><Search size={16} aria-hidden="true"/><input type="search" value={query} placeholder={t("catalog.searchModels")} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
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
    </details>
  );
}
