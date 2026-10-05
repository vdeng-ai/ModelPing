import { useEffect, useState } from "preact/hooks";
import { Check, Download, Plus, Save, Search, Trash2, Upload, X } from "lucide-preact";
import type { Defaults, PresetsResponse, ProviderPreset } from "../lib/types.js";
import { normalizePresets } from "../lib/presets.js";
import { useMediaQuery } from "./useMediaQuery.js";
import { ActionMenu } from "./ActionMenu.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { useI18n } from "../lib/i18n.js";

interface Props {
  providers: ProviderPreset[];
  defaults: Defaults;
  busy: boolean;
  onChange: (providers: ProviderPreset[]) => void;
  onImport: (presets: PresetsResponse) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}

const cloneProvider = (p: ProviderPreset): ProviderPreset => ({
  ...p,
  models: p.models.map((m) => ({ ...m })),
});

const emptyProvider = (used: Set<string>): ProviderPreset => {
  let i = 1;
  while (used.has(`provider-${i}`)) i++;
  return {
    id: `provider-${i}`,
    name: `Provider ${i}`,
    baseUrl: "https://api.example.com/v1",
    models: [],
  };
};

function downloadJson(presets: PresetsResponse) {
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-test-presets-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsPanel({ providers, defaults, busy, onChange, onImport, onDirtyChange, onSaved }: Props) {
  const { t, lang } = useI18n();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? "");
  const [draft, setDraft] = useState<ProviderPreset | null>(providers[0] ? cloneProvider(providers[0]) : null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const selected = providers.find((provider) => provider.id === selectedId);
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(selected));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    const nextId = providers.some((p) => p.id === selectedId) ? selectedId : providers[0]?.id ?? "";
    if (nextId !== selectedId) setSelectedId(nextId);
    const next = providers.find((p) => p.id === nextId);
    setDraft(next ? cloneProvider(next) : null);
  }, [providers, selectedId]);
  const guard = (action: () => void) => { if (dirty) setPendingAction(() => action); else action(); };
  const applyProviders = (next: ProviderPreset[], nextId?: string) => {
    try {
      const normalized = normalizePresets({ providers: next, defaults });
      onChange(normalized.providers); setSelectedId(nextId ?? normalized.providers[0]?.id ?? ""); setError(null);
    } catch (e: any) { setError(e?.message ?? String(e)); }
  };
  const addProvider = () => guard(() => { const next = emptyProvider(new Set(providers.map((p) => p.id))); applyProviders([...providers, next], next.id); });
  const saveProvider = () => {
    if (!draft) return;
    try {
      const cleaned = normalizePresets({ providers: [draft], defaults }).providers[0];
      if (providers.some((p) => p.id !== selectedId && p.id === cleaned.id)) throw new Error(t("ui.duplicateId"));
      applyProviders(providers.map((p) => p.id === selectedId ? cleaned : p), cleaned.id); onSaved?.();
    } catch (e: any) { setError(e?.message ?? String(e)); }
  };
  const updateDraft = (patch: Partial<ProviderPreset>) => setDraft((p) => p ? { ...p, ...patch } : p);
  const updateModel = (idx: number, patch: Partial<ProviderPreset["models"][number]>) => setDraft((p) => p ? { ...p, models: p.models.map((m, i) => i === idx ? { ...m, ...patch } : m) } : p);
  const importFile = async (file: File | null) => {
    if (!file) return;
    try { const parsed = normalizePresets(JSON.parse(await file.text())); guard(() => { onImport(parsed); setSelectedId(parsed.providers[0]?.id ?? ""); setError(null); }); }
    catch (e: any) { setError(e?.message ?? String(e)); }
  };
  const importControl = <label class={"button-like" + (busy ? " disabled" : "")}><Upload size={16} aria-hidden="true" />{t("settings.importConfig")}<input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => { void importFile(e.currentTarget.files?.[0] ?? null); e.currentTarget.value = ""; }} /></label>;
  const exportControl = <button disabled={busy || !providers.length} onClick={() => downloadJson({ providers, defaults })}><Download size={16} />{t("settings.exportConfig")}</button>;
  const field = (key: "id" | "name" | "baseUrl" | "keyHint" | "docs", label: string, full = false) => <div class={"field" + (full ? " full" : "")}><label for={`provider-${key}`}>{label}</label><input id={`provider-${key}`} class={key === "name" ? "" : "mono"} value={draft?.[key] ?? ""} disabled={busy} onInput={(e) => updateDraft({ [key]: e.currentTarget.value })} /></div>;
  const filtered = providers.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section class="panel settings-panel">
    <div class="settings-page-toolbar"><h2>{t("ui.providerConfig")}</h2><span class="spacer" />{importControl}{exportControl}</div>
    <div class="mobile-provider-picker"><label class="field"><span>{t("app.tabProviders")}</span><select value={selectedId} disabled={busy} onChange={(e) => { const id = e.currentTarget.value; guard(() => setSelectedId(id)); }} aria-label={t("app.tabProviders")}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><ActionMenu label={t("ui.more")}><button disabled={busy} onClick={addProvider}><Plus size={16} />{t("settings.addProvider")}</button>{importControl}{exportControl}<button class="danger-quiet" disabled={busy || !draft} onClick={() => setDeleteConfirm(true)}><Trash2 size={16} />{t("settings.deleteProvider")}</button></ActionMenu></div>
    <div class="settings-layout">
      <aside class="provider-list"><div class="provider-list-head"><h2>{t("app.tabProviders")}</h2><button class="icon-button subtle" aria-label={t("settings.addProvider")} disabled={busy} onClick={addProvider}><Plus size={18} /></button></div><label class="search-control"><Search size={17} /><input type="search" value={query} placeholder={t("ui.searchProviders")} aria-label={t("ui.searchProviders")} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
        {!filtered.length ? <div class="empty">{t(providers.length ? "ui.noMatch" : "settings.emptyProviders")}</div> : filtered.map((p) => <button key={p.id} type="button" class={"provider-card " + (p.id === selectedId ? "active" : "")} aria-pressed={p.id === selectedId} disabled={busy} onClick={() => guard(() => setSelectedId(p.id))}><span class="provider-card-main"><strong>{p.name}</strong><small class="mono muted">{p.id}</small></span><span class="provider-card-meta">{p.models.length} {lang === "zh" ? "个模型" : "models"}</span>{p.id === selectedId ? <Check size={14} /> : null}</button>)}
      </aside>
      <div class="settings-form">
        {draft ? <>
          <div class="provider-form-heading"><h2>{draft.name}</h2><span class={dirty ? "dirty-indicator" : "muted"}>{dirty ? t("ui.dirty") : t("ui.saved")}</span><small class="mono muted">ID: {draft.id}</small></div>
          {error ? <div class="settings-error fail" role="alert">{error}</div> : null}
          <div class="settings-grid">{!mobile ? field("id", t("settings.id")) : null}{field("name", t("settings.name"))}{field("baseUrl", t("settings.baseUrl"), true)}<div class="field full"><label class="toggle"><input type="checkbox" checked={Boolean(draft.isFullUrl)} disabled={busy} onChange={(e) => updateDraft({ isFullUrl: e.currentTarget.checked })} />{t("settings.baseUrlIsFull")}</label></div>{!mobile ? <>{field("keyHint", t("settings.keyHint"))}{field("docs", t("settings.docs"))}</> : null}</div>
          {mobile ? <details class="mobile-provider-advanced"><summary>{t("ui.advancedFields")}</summary><div class="settings-grid">{field("id", t("settings.id"))}{field("keyHint", t("settings.keyHint"))}{field("docs", t("settings.docs"), true)}</div></details> : null}
          <div class="models-editor"><div class="models-editor-head"><h3>{t("settings.models")} <span class="tab-count">{draft.models.length}</span></h3><button disabled={busy} onClick={() => updateDraft({ models: [...draft.models, { id: "" }] })}><Plus size={16} />{t("settings.addModel")}</button></div>
            {!draft.models.length ? <div class="empty">{t("settings.emptyModels")}</div> : draft.models.map((m, idx) => <details class="model-edit-disclosure" key={`${selectedId}-${idx}`} open={!mobile || !m.id}><summary><strong class="mono">{m.id || t("settings.modelIdPlaceholder")}</strong><small class="muted">{m.label || t("settings.modelLabelPlaceholder")}</small></summary><div class="model-edit-row"><label class="field"><span>{t("settings.modelIdPlaceholder")}</span><input class="mono" value={m.id} disabled={busy} onInput={(e) => updateModel(idx, { id: e.currentTarget.value })} /></label><label class="field"><span>{t("settings.modelLabelPlaceholder")}</span><input value={m.label ?? ""} disabled={busy} onInput={(e) => updateModel(idx, { label: e.currentTarget.value })} /></label><button class="icon-button subtle danger-quiet" disabled={busy} aria-label={t("settings.removeModel")} onClick={() => updateDraft({ models: draft.models.filter((_, i) => i !== idx) })}><X size={16} /></button></div></details>)}
          </div>
          <div class="provider-form-actions"><button class="danger-quiet desktop-delete" disabled={busy} onClick={() => setDeleteConfirm(true)}><Trash2 size={16} />{t("settings.deleteProvider")}</button><span class="spacer" /><button disabled={busy || !dirty} onClick={() => { setDraft(selected ? cloneProvider(selected) : null); setError(null); }}>{t("ui.discard")}</button><button class="primary" disabled={busy || !dirty} onClick={saveProvider}><Save size={16} />{t("settings.saveProvider")}</button></div>
        </> : <div class="empty">{t("settings.selectOrAdd")}</div>}
      </div>
    </div>
    {pendingAction ? <ConfirmModal title={t("ui.discardTitle")} description={t("ui.discardBody")} confirmLabel={t("ui.discardConfirm")} onClose={() => setPendingAction(null)} onConfirm={() => { const action = pendingAction; setPendingAction(null); action(); }} /> : null}
    {deleteConfirm && draft ? <ConfirmModal title={t("settings.deleteProvider")} description={t("settings.confirmDelete", { name: draft.name })} confirmLabel={t("settings.deleteProvider")} onClose={() => setDeleteConfirm(false)} onConfirm={() => { setDeleteConfirm(false); applyProviders(providers.filter((p) => p.id !== selectedId)); }} /> : null}
  </section>;
}
