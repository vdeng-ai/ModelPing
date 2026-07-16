import { useMemo, useState } from "preact/hooks";
import { Ban, BookmarkPlus, CheckSquare, Equal, Play, Plus, RadioTower, Save, Square, Trash2, X } from "lucide-preact";
import type { Protocol, StatusEntry, TestResult } from "../lib/types.js";
import { fmtMs, fmtTok, PROTOCOL_LABEL } from "../lib/format.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { PromptModal } from "./PromptModal.js";
import { useI18n, translate, type Lang } from "../lib/i18n.js";
import { PROTOCOLS, protocolsForProvider } from "../../src/protocols.js";
import { CUSTOM_PROVIDER_ID } from "../lib/presets.js";
import { sortByDisplayText } from "../lib/alphabetical-sort.js";
import type { ModelRow, ProtocolProbe } from "../lib/model-rows.js";
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
  const { rows, busy, conn, providerName, savedCustomModels } = props;
  const [newModel, setNewModel] = useState("");
  const [statusNamePrompt, setStatusNamePrompt] = useState<Array<Omit<StatusEntry, "id">> | null>(null);
  const [lastCustomProviderName, setLastCustomProviderName] = useState("");

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked);
  const selectedCount = rows.filter((r) => r.checked).length;
  const canAddStatus = Boolean(conn.baseUrl.trim() && conn.apiKey.trim());
  const savedSet = new Set(savedCustomModels);
  const isCustomProvider = conn.providerId === CUSTOM_PROVIDER_ID;
  const sortedRows = useMemo(
    () => sortByDisplayText(rows, (row) => row.label),
    [rows],
  );

  // 取该行第一个成功协议的输出文本作预览。
  const previewText = (r: ModelRow): string => {
    for (const p of PROTOCOLS) {
      const pr = r.probes[p];
      if (pr.status === "success" && pr.result?.text) return pr.result.text;
    }
    return "";
  };
  // 取该行第一个成功协议的 usage 作展示。
  const firstSuccess = (r: ModelRow): TestResult | null => {
    for (const p of PROTOCOLS) {
      const pr = r.probes[p];
      if (pr.status === "success" && pr.result) return pr.result;
    }
    return null;
  };
  const statusText = (r: ModelRow): string => {
    const testing = PROTOCOLS.filter((p) => r.probes[p].status === "testing").length;
    if (testing) return t("models.statusTesting");
    const success = PROTOCOLS.filter((p) => r.probes[p].status === "success").length;
    if (success) return t("models.statusPassed", { count: success });
    const fail = PROTOCOLS.filter((p) => r.probes[p].status === "fail").length;
    if (fail) return t("models.statusFailed");
    return t("models.statusPending");
  };
  const statusClass = (r: ModelRow): string => {
    if (PROTOCOLS.some((p) => r.probes[p].status === "testing")) return "testing";
    if (PROTOCOLS.some((p) => r.probes[p].status === "success")) return "success";
    if (PROTOCOLS.some((p) => r.probes[p].status === "fail")) return "fail";
    return "idle";
  };

  const add = () => {
    if (!newModel.trim()) return;
    props.onAdd(newModel.trim());
    setNewModel("");
  };

  const statusDraft = (r: ModelRow, name = providerName): Omit<StatusEntry, "id"> => {
    const successProtocol = PROTOCOLS.find((p) => r.probes[p].status === "success");
    const model = r.modelByProvider[conn.providerId] ?? r.label;
    const protocol = successProtocol ?? protocolsForProvider(conn.providerId, `${r.label} ${model}`)[0];
    return {
      providerName: name,
      protocol,
      baseUrl: conn.baseUrl,
      isFullUrl: Boolean(conn.isFullUrl),
      apiKey: conn.apiKey,
      userAgent: props.userAgent || undefined,
      model,
    };
  };

  const addRowsToStatus = (items: ModelRow[]) => {
    if (!canAddStatus || items.length === 0) return;
    const drafts = items.map((r) => statusDraft(r));
    if (isCustomProvider) {
      setStatusNamePrompt(drafts);
      return;
    }
    props.onAddToStatus(drafts);
  };

  return (
    <section class="panel model-panel" aria-labelledby="models-heading">
      <h2 id="models-heading" class="sr-only">{t("models.title")}</h2>

      <div class="model-toolbar">
        <div class="model-primary-actions">
          <button class="primary" disabled={busy || !someChecked} onClick={props.onTestSelected}>
            <Play size={16} fill="currentColor" aria-hidden="true" />
            {selectedCount ? t("models.testSelectedCount", { count: selectedCount }) : t("models.testSelected")}
          </button>
          {busy ? (
            <button class="danger" onClick={props.onCancel}>
              <X size={16} aria-hidden="true" />
              {t("models.cancelTests")}
            </button>
          ) : null}
        </div>
        <div class="model-secondary-actions">
          <button disabled={busy || rows.length === 0} onClick={() => props.onToggleAll(!allChecked)}>
            {allChecked ? <CheckSquare size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
            {allChecked ? t("common.deselectAll") : t("common.selectAll")}
          </button>
          <button disabled={busy || !someChecked || !canAddStatus} onClick={() => addRowsToStatus(rows.filter((r) => r.checked))}>
            <BookmarkPlus size={16} aria-hidden="true" />
            {t("models.addSelectedToStatus")}
          </button>
        <CcSwitchButton
          name={providerName}
          endpoint={conn.baseUrl}
          apiKey={conn.apiKey}
          defaultApp="claude"
          disabled={busy || !conn.baseUrl || !conn.apiKey}
          onLaunched={props.onLaunched}
        />
        </div>
      </div>

      {busy ? (
        <div class="batch-progress" aria-live="polite">
          <div class="batch-progress-label">
            <span>{t("models.progress", props.progress)}</span>
            <span>{Math.round((props.progress.completed / Math.max(1, props.progress.total)) * 100)}%</span>
          </div>
          <progress
            max={Math.max(1, props.progress.total)}
            value={props.progress.completed}
            aria-label={t("models.progress", props.progress)}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div class="empty">{t("models.empty")}</div>
      ) : (
        <div class="model-result-list">
          <div class="model-list-head" aria-hidden="true">
            <span />
            <span>{t("models.colModel")}</span>
            <span>{t("models.colProtocol")}</span>
            <span>{t("models.colResult")}</span>
            <span>{t("models.colActions")}</span>
          </div>
          {sortedRows.map((r) => {
            const fs = firstSuccess(r);
            const preview = previewText(r);
            const showSave = r.custom && !savedSet.has(r.label);
            return (
              <div
                key={r.key}
                class={"model-result-row " + (r.checked ? "selected " : "") + statusClass(r)}
              >
                <div class="model-row-main">
                  <label class="row-check" title={r.label}>
                    <input
                      type="checkbox"
                      checked={r.checked}
                      disabled={busy}
                      aria-label={r.label}
                      onChange={(e) => props.onToggle(r.key, (e.target as HTMLInputElement).checked)}
                    />
                  </label>
                  <div class="model-identity">
                    <span class="model-name" title={r.label}>{r.label}</span>
                    <span class={"model-verdict " + statusClass(r)}>
                      <span class="status-dot" aria-hidden="true" />
                      {statusText(r)}
                    </span>
                  </div>
                  <div class="proto-badges">
                    {shownProtocols(r, conn.providerId).map((p) => <Badge probe={r.probes[p]} lang={lang} />)}
                  </div>
                  <div class="model-metrics">
                    <span><small>{t("models.latency")}</small><strong>{fs ? fmtMs(fs.latencyMs) : t("common.dash")}</strong></span>
                    <span><small>{t("models.ttft")}</small><strong>{fs ? fmtMs(fs.ttftMs) : t("common.dash")}</strong></span>
                    <span><small>{t("models.tokens")}</small><strong>{fs ? fmtTok(fs.usage.totalTokens) : t("common.dash")}</strong></span>
                  </div>
                  <div class="model-row-actions">
                    {showSave ? (
                      <button
                        type="button"
                        class="icon-button subtle"
                        title={props.privatePersistAvailable ? t("models.saveModelTitle") : t("models.saveModelUnavailable")}
                        aria-label={props.privatePersistAvailable ? t("models.saveModelTitle") : t("models.saveModelUnavailable")}
                        disabled={busy || !props.privatePersistAvailable}
                        onClick={() => props.onSaveCustomModel(r.label)}
                      >
                        <Save size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      class="icon-button subtle"
                      title={t("models.addToStatus")}
                      aria-label={t("models.addToStatus")}
                      disabled={busy || !canAddStatus}
                      onClick={() => addRowsToStatus([r])}
                    >
                      <BookmarkPlus size={15} aria-hidden="true" />
                    </button>
                    {r.custom ? (
                      <button type="button" class="icon-button subtle danger-quiet" title={t("common.remove")} aria-label={t("common.remove")} disabled={busy} onClick={() => props.onRemove(r.key)}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {preview ? (
                  <details class="model-response">
                    <summary>{t("models.responsePreview")}</summary>
                    <pre>{preview}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div class="add-model">
        <input
          class="mono"
          placeholder={t("models.addPlaceholder")}
          value={newModel}
          onInput={(e) => setNewModel((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button disabled={!newModel.trim()} onClick={add}>
          <Plus size={16} aria-hidden="true" />
          {t("models.addModel")}
        </button>
      </div>

      {statusNamePrompt ? (
        <PromptModal
          title={t("models.statusProviderNameTitle")}
          confirmLabel={t("models.statusProviderNameConfirm")}
          fields={[{
            key: "name",
            label: t("models.statusProviderName"),
            placeholder: t("models.statusProviderNamePlaceholder"),
            defaultValue: lastCustomProviderName,
            required: true,
          }]}
          onClose={() => setStatusNamePrompt(null)}
          onConfirm={({ name }) => {
            setLastCustomProviderName(name);
            props.onAddToStatus(statusNamePrompt.map((d) => ({ ...d, providerName: name })));
            setStatusNamePrompt(null);
          }}
        />
      ) : null}
    </section>
  );
}
