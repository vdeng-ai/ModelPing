import { useState } from "preact/hooks";
import type { Protocol, StatusEntry, TestResult } from "../lib/types.js";
import { fmtMs, fmtTok, PROTOCOL_LABEL, streamGlyph } from "../lib/format.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { useI18n, translate, type Lang } from "../lib/i18n.js";
import { PROTOCOLS, protocolsForProvider } from "../../src/protocols.js";
import type { ModelRow, ProtocolProbe } from "../lib/model-rows.js";
export { protocolsForModel } from "../lib/model-rows.js";

interface Props {
  rows: ModelRow[];
  busy: boolean;
  progress: { completed: number; total: number };
  conn: { providerId: string; baseUrl: string; isFullUrl?: boolean; apiKey: string };
  userAgent: string;
  providerName: string;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  customModelsPersist: boolean;
  customModelsPersistAvailable: boolean;
  onToggleCustomModelsPersist: (on: boolean) => void;
  onAdd: (model: string) => void;
  onRemove: (key: string) => void;
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
  const g = streamGlyph(streamVerdict);
  return (
    <span class={"pbadge " + status} title={title} aria-label={title}>
      <span class="pbadge-label">{PROTOCOL_LABEL[protocol]}</span>
      {g ? <span class={"stream-mark " + g.cls}>{g.char}</span> : null}
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
  const [newModel, setNewModel] = useState("");

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked);
  const canAddStatus = Boolean(conn.baseUrl.trim() && conn.apiKey.trim());

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

  const add = () => {
    if (!newModel.trim()) return;
    props.onAdd(newModel.trim());
    setNewModel("");
  };

  const statusDraft = (r: ModelRow): Omit<StatusEntry, "id"> => {
    const successProtocol = PROTOCOLS.find((p) => r.probes[p].status === "success");
    const model = r.modelByProvider[conn.providerId] ?? r.label;
    const protocol = successProtocol ?? protocolsForProvider(conn.providerId, `${r.label} ${model}`)[0];
    return {
      providerName,
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
    props.onAddToStatus(items.map(statusDraft));
  };

  return (
    <section class="panel">
      <h2>{t("models.title")}</h2>

      <div class="actions" style="margin-bottom:12px">
        <button class="primary" disabled={busy || !someChecked} onClick={props.onTestSelected}>
          {t("models.testSelected")}
        </button>
        {busy ? <button class="danger" onClick={props.onCancel}>{t("models.cancelTests")}</button> : null}
        <button disabled={busy || rows.length === 0} onClick={() => props.onToggleAll(!allChecked)}>
          {allChecked ? t("common.deselectAll") : t("common.selectAll")}
        </button>
        <button disabled={busy || !someChecked || !canAddStatus} onClick={() => addRowsToStatus(rows.filter((r) => r.checked))}>
          {t("models.addSelectedToStatus")}
        </button>
        <label
          class="toggle model-persist-toggle"
          title={props.customModelsPersistAvailable ? t("models.persistCustomTitle") : t("models.persistCustomUnavailable")}
        >
          <input
            type="checkbox"
            checked={props.customModelsPersist}
            disabled={!props.customModelsPersistAvailable}
            onChange={(e) => props.onToggleCustomModelsPersist((e.target as HTMLInputElement).checked)}
          />
          {t("models.persistCustom")}
        </label>
        <CcSwitchButton
          name={providerName}
          endpoint={conn.baseUrl}
          apiKey={conn.apiKey}
          defaultApp="claude"
          disabled={busy || !conn.baseUrl || !conn.apiKey}
          onLaunched={props.onLaunched}
        />
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
        <div class="model-card-grid">
          {rows.map((r) => {
            const fs = firstSuccess(r);
            const preview = previewText(r);
            return (
              <div
                key={r.key}
                role="checkbox"
                aria-checked={r.checked}
                aria-disabled={busy}
                tabIndex={busy ? -1 : 0}
                class={"provider-card model-card " + (r.checked ? "active" : "")}
                onClick={() => { if (!busy) props.onToggle(r.key, !r.checked); }}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onToggle(r.key, !r.checked);
                  }
                }}
              >
                <span class="model-card-head">
                  <span class="model-name">{r.label}</span>
                  <span class="model-card-actions">
                    <button
                      type="button"
                      class={"model-status-add " + (!canAddStatus ? "disabled" : "")}
                      title={t("models.addToStatus")}
                      disabled={busy || !canAddStatus}
                      onClick={(e) => {
                        e.stopPropagation();
                        addRowsToStatus([r]);
                      }}
                    >
                      {t("models.addToStatus")}
                    </button>
                  {r.custom ? (
                    <button
                      type="button"
                      class="model-remove"
                      title={t("common.remove")}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onRemove(r.key);
                      }}
                    >
                      x
                    </button>
                  ) : null}
                  </span>
                </span>
                <span class="model-card-status">
                  <span class="proto-badges">
                    {shownProtocols(r, conn.providerId).map((p) => <Badge probe={r.probes[p]} lang={lang} />)}
                  </span>
                  <span class="status-text">{statusText(r)}</span>
                </span>
                <span class="model-card-usage">
                  {fs
                    ? `${fmtTok(fs.usage.inputTokens)} / ${fmtTok(fs.usage.outputTokens)} / ${fmtTok(fs.usage.totalTokens)}`
                    : t("models.inOutTotal")}
                </span>
                {preview ? (
                  <span class="text-preview model-preview">{preview}</span>
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
          {t("models.addModel")}
        </button>
      </div>
    </section>
  );
}
