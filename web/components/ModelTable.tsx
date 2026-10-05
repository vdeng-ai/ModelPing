import { useState } from "preact/hooks";
import { Ban, BookmarkPlus, ChevronRight, Equal, Play, Plus, RadioTower, Save, Search, Trash2, X } from "lucide-preact";
import type { Protocol, StatusEntry } from "../lib/types.js";
import { fmtMs, fmtTok, PROTOCOL_LABEL } from "../lib/format.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { PromptModal } from "./PromptModal.js";
import { useI18n, translate, type Lang } from "../lib/i18n.js";
import { PROTOCOLS, protocolsForProvider } from "../../src/protocols.js";
import { CUSTOM_PROVIDER_ID } from "../lib/presets.js";
import { groupModelsByFamily } from "../lib/model-groups.js";
import type { ModelRow, ProtocolProbe } from "../lib/model-rows.js";
import { ActionMenu } from "./ActionMenu.js";
import { CopyButton } from "./CopyButton.js";
import { rowState, rowResult } from "../lib/result-presentation.js";
export { protocolsForModel } from "../lib/model-rows.js";

interface Props {
  rows: ModelRow[];
  busy: boolean;
  progress: { completed: number; total: number };
  conn: { providerId: string; baseUrl: string; isFullUrl?: boolean; apiKey: string };
  userAgent: string;
  providerName: string;
  savedCustomModels: string[];
  privatePersistAvailable: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onToggleGroup: (keys: string[], checked: boolean) => void;
  onAdd: (model: string) => void;
  onRemove: (key: string) => void;
  onSaveCustomModel: (model: string) => void;
  onTestSelected: () => void;
  onCancel: () => void;
  onAddToStatus: (entries: Array<Omit<StatusEntry, "id">>) => void;
  onLaunched: (msg: string) => void;
}

// 协议徽章：带协议简称的状态药丸（绿通过 / 红失败 / 蓝测试中 / 中性待测），
// 流式结论以内嵌图标显示（⚡真流式 / ~伪流式 / ⌁无流），完整文案在 tooltip。
function streamText(verdict: ProtocolProbe["streamVerdict"], ttftMs: number | null, lang: Lang): string {
  const tr = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  switch (verdict) {
    case "stream":
      return tr("models.streamSupport", { ttft: ttftMs != null ? tr("models.streamSupportTtft", { ttft: fmtMs(ttftMs) }) : "" });
    case "single":
      return tr("models.streamSingle");
    case "none":
      return tr("models.streamNone");
    default:
      return "";
  }
}

function Badge({ probe, lang }: { probe: ProtocolProbe; lang: Lang }) {
  const { protocol, status, result, streamVerdict, streamTtftMs } = probe;
  const tr = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  const title =
    status === "fail" && result?.error ? tr("models.badgeFail", { protocol, error: result.error })
    : status === "success" ? tr("models.badgeSuccess", { protocol, latency: fmtMs(result?.latencyMs ?? null), stream: streamText(streamVerdict, streamTtftMs, lang) })
    : status === "testing" ? tr("models.badgeTesting", { protocol })
    : status === "skipped" ? tr("models.badgeSkipped", { protocol })
    : tr("models.badgePending", { protocol });
  const StreamIcon = streamVerdict === "stream" ? RadioTower : streamVerdict === "single" ? Equal : streamVerdict === "none" ? Ban : null;
  return (
    <span class={"pbadge " + status} title={title} aria-label={title}>
      <span class="pbadge-label">{PROTOCOL_LABEL[protocol]}</span>
      {StreamIcon ? <StreamIcon class={"stream-icon " + streamVerdict} size={12} aria-hidden="true" /> : null}
    </span>
  );
}

// 该模型卡要显示哪些协议徽章：测试前只显示计划要测的协议，测试中/后显示实际跑的，隐藏跳过的。
function shownProtocols(r: ModelRow, providerId: string): Protocol[] {
  const model = r.modelByProvider[providerId] ?? r.label;
  const planned = protocolsForProvider(providerId, `${r.label} ${model}`);
  return PROTOCOLS.filter((p) => {
    const s = r.probes[p].status;
    if (s === "skipped") return false;
    if (s === "idle") return planned.includes(p);
    return true; // testing / success / fail
  });
}

export function ModelTable(props: Props) {
  const { t, lang } = useI18n();
  const { rows, busy, conn, providerName } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [newModel, setNewModel] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [statusNamePrompt, setStatusNamePrompt] = useState<Array<Omit<StatusEntry, "id">> | null>(null);
  const [lastCustomProviderName, setLastCustomProviderName] = useState("");
  const visibleRows = rows.filter((row) => (!query.trim() || `${row.label} ${Object.values(row.modelByProvider).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())) && (filter === "all" || rowState(row) === filter));
  const selectedCount = rows.filter((row) => row.checked).length;
  const allVisibleChecked = visibleRows.length > 0 && visibleRows.every((row) => row.checked);
  const canAddStatus = Boolean(conn.baseUrl.trim() && conn.apiKey.trim());
  const listEntries = groupModelsByFamily(visibleRows, (row) => row.label);
  const toggle = (setter: typeof setExpanded, key: string) => setter((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const addRowsToStatus = (items: ModelRow[]) => {
    if (!canAddStatus || !items.length) return;
    const drafts = items.map((r): Omit<StatusEntry, "id"> => ({
      providerName, protocol: PROTOCOLS.find((p) => r.probes[p].status === "success") ?? protocolsForProvider(conn.providerId, r.label)[0],
      baseUrl: conn.baseUrl, isFullUrl: conn.isFullUrl, apiKey: conn.apiKey, userAgent: props.userAgent || undefined,
      model: r.modelByProvider[conn.providerId] ?? r.label,
    }));
    if (conn.providerId === CUSTOM_PROVIDER_ID) setStatusNamePrompt(drafts);
    else props.onAddToStatus(drafts);
  };
  const renderRow = (r: ModelRow) => {
    const state = rowState(r);
    const probe = rowResult(r);
    const result = probe?.result;
    const ttft = probe?.streamTtftMs ?? result?.ttftMs ?? null;
    const open = expanded.has(r.key);
    return <div key={r.key} class={"model-result-row " + state + (r.checked ? " selected" : "")}>
      <div class="model-row-main">
        <label class="row-check"><input type="checkbox" aria-label={r.label} checked={r.checked} disabled={busy} onChange={(e) => props.onToggle(r.key, e.currentTarget.checked)} /></label>
        <div class="model-identity"><span class="model-name" title={r.label}>{r.label}</span></div>
        <div class="proto-badges">{shownProtocols(r, conn.providerId).map((p) => <Badge key={p} probe={r.probes[p]} lang={lang} />)}</div>
        <span class={"model-verdict " + state}><span class="status-dot" aria-hidden="true" />{t(state === "success" ? "ui.passed" : state === "fail" ? "ui.failed" : state === "testing" ? "models.statusTesting" : "models.statusPending")}</span>
        <div class="model-metrics"><span><small>{t("models.latency")}</small><strong>{fmtMs(result?.latencyMs ?? null)}</strong></span><span><small>{t("models.ttft")}</small><strong>{fmtMs(ttft)}</strong></span><span><small>{t("models.tokens")}</small><strong>{fmtTok(result?.usage.totalTokens ?? null)}</strong></span></div>
        <div class="model-row-actions">
          <ActionMenu label={`${t("ui.more")} · ${r.label}`}>
            <button disabled={busy || !canAddStatus} onClick={() => addRowsToStatus([r])}><BookmarkPlus size={16} />{t("models.addToStatus")}</button>
            {r.custom && !props.savedCustomModels.includes(r.label) ? <button disabled={busy || !props.privatePersistAvailable} onClick={() => props.onSaveCustomModel(r.label)}><Save size={16} />{t("models.saveModelTitle")}</button> : null}
            <button class="danger-quiet" disabled={busy} onClick={() => props.onRemove(r.key)}><Trash2 size={16} />{t("common.remove")}</button>
          </ActionMenu>
          {result ? <button type="button" class="icon-button subtle detail-toggle" aria-label={open ? t("ui.collapse") : t("ui.details")} aria-expanded={open} onClick={() => toggle(setExpanded, r.key)}><ChevronRight size={17} /></button> : null}
        </div>
      </div>
      {open && result ? <div class={"result-details " + state}>
        {!result.ok ? <p class="fail"><strong>HTTP {result.status || "—"}</strong> · {result.error}</p> : null}
        <div class="detail-heading"><strong>{t(result.ok ? "ui.response" : "ui.failureLog")}</strong><CopyButton value={result.ok ? result.text : result.failureLog || result.error || ""} title={t("ui.more")} /></div>
        <pre>{result.ok ? result.text : result.failureLog || result.error}</pre>
        {shownProtocols(r, conn.providerId).length > 1 ? <details><summary>{t("models.colProtocol")}</summary>{shownProtocols(r, conn.providerId).map((p) => <div key={p}><Badge probe={r.probes[p]} lang={lang} /> {r.probes[p].result?.error || r.probes[p].result?.text || t("models.statusPending")}</div>)}</details> : null}
      </div> : null}
    </div>;
  };
  return <section class="panel model-panel" aria-labelledby="models-heading">
    <h2 id="models-heading" class="sr-only">{t("models.title")}</h2>
    <div class="model-toolbar">
      <label class="search-control"><Search size={17} aria-hidden="true" /><input type="search" value={query} placeholder={t("ui.searchModels")} aria-label={t("ui.searchModels")} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
      <select class="result-filter" aria-label={t("ui.allResults")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)}><option value="all">{t("ui.allResults")}</option><option value="success">{t("ui.passed")}</option><option value="fail">{t("ui.failed")}</option><option value="idle">{t("ui.pending")}</option></select>
      <label class="select-visible"><input type="checkbox" disabled={busy || !visibleRows.length} checked={allVisibleChecked} onChange={(e) => props.onToggleGroup(visibleRows.map((row) => row.key), e.currentTarget.checked)} />{t("common.selectAll")}</label>
      <span class="selection-count">{t("ui.selected", { count: selectedCount })}</span>
      <div class="model-primary-actions">
        <ActionMenu label={t("ui.more")}><label class="menu-field">{t("ui.allResults")}<select value={filter} onChange={(e) => setFilter(e.currentTarget.value)}><option value="all">{t("ui.allResults")}</option><option value="success">{t("ui.passed")}</option><option value="fail">{t("ui.failed")}</option><option value="idle">{t("ui.pending")}</option></select></label><button disabled={busy || !selectedCount || !canAddStatus} onClick={() => addRowsToStatus(rows.filter((r) => r.checked))}><BookmarkPlus size={16} />{t("models.addSelectedToStatus")}</button><CcSwitchButton name={providerName} endpoint={conn.baseUrl} apiKey={conn.apiKey} defaultApp="claude" disabled={busy || !canAddStatus} onLaunched={props.onLaunched} /></ActionMenu>
        {busy ? <button class="danger" onClick={props.onCancel}><X size={16} />{t("models.cancelTests")}</button> : <button class="primary" disabled={!selectedCount} onClick={props.onTestSelected}><Play size={16} fill="currentColor" />{selectedCount ? t("models.testSelectedCount", { count: selectedCount }) : t("models.testSelected")}</button>}
      </div>
    </div>
    {busy ? <div class="batch-progress" aria-live="polite"><div class="batch-progress-label">{t("models.progress", props.progress)}</div><progress max={Math.max(1, props.progress.total)} value={props.progress.completed} aria-label={t("models.progress", props.progress)} /></div> : null}
    <div class="model-result-list">
      <div class="model-list-head" aria-hidden="true"><span /><span>{t("models.colModel")}</span><span>{t("models.colProtocol")}</span><span>{t("models.colStatus")}</span><span>{t("models.colResult")}</span><span>{t("models.colActions")}</span></div>
      {!visibleRows.length ? <div class="empty">{t(rows.length ? "ui.noMatch" : "models.empty")}</div> : listEntries.map((entry) => {
        if (entry.kind === "model") return renderRow(entry.model);
        const groupOpen = !collapsedGroups.has(entry.key);
        const checked = entry.models.every((row) => row.checked);
        return <section key={entry.key} class="model-group" aria-label={entry.label}>
          <div class="model-group-head"><label class="model-group-check"><input type="checkbox" checked={checked} disabled={busy} aria-label={t("models.selectGroup", { group: entry.label })} ref={(el) => { if (el) el.indeterminate = !checked && entry.models.some((row) => row.checked); }} onChange={(e) => props.onToggleGroup(entry.models.map((row) => row.key), e.currentTarget.checked)} /></label><button type="button" class="model-group-toggle" aria-expanded={groupOpen} aria-controls={`group-${entry.key}`} onClick={() => toggle(setCollapsedGroups, entry.key)}><ChevronRight class={groupOpen ? "turned" : ""} size={16} /><strong>{entry.label}</strong><span class="muted">({entry.models.length})</span></button></div>
          <div id={`group-${entry.key}`} hidden={!groupOpen}>{groupOpen ? entry.models.map(renderRow) : null}</div>
        </section>;
      })}
    </div>
    <div class="add-model"><input class="mono" value={newModel} placeholder={t("models.addPlaceholder")} aria-label={t("models.addModel")} onInput={(e) => setNewModel(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && newModel.trim()) { props.onAdd(newModel.trim()); setNewModel(""); } }} /><button disabled={busy || !newModel.trim()} onClick={() => { props.onAdd(newModel.trim()); setNewModel(""); }}><Plus size={16} />{t("models.addModel")}</button><span class="muted">{t("ui.total", { count: rows.length })}</span></div>
    {statusNamePrompt ? <PromptModal title={t("models.statusProviderNameTitle")} confirmLabel={t("models.statusProviderNameConfirm")} fields={[{ key: "name", label: t("models.statusProviderName"), placeholder: t("models.statusProviderNamePlaceholder"), defaultValue: lastCustomProviderName, required: true }]} onClose={() => setStatusNamePrompt(null)} onConfirm={({ name }) => { setLastCustomProviderName(name); props.onAddToStatus(statusNamePrompt.map((draft) => ({ ...draft, providerName: name }))); setStatusNamePrompt(null); }} /> : null}
  </section>;
}
