import type { HistoryEntry } from "../lib/types.js";
import { fmtMs, fmtTok, fmtTime, PROTOCOL_LABEL, streamGlyph } from "../lib/format.js";
import { maskKey } from "../lib/storage.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { CopyButton } from "./CopyButton.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { useI18n } from "../lib/i18n.js";

interface Props {
  entries: HistoryEntry[];
  persist: boolean;
  onTogglePersist: (on: boolean) => void;
  onClear: () => void;
  onLaunched: (msg: string) => void;
}

function exportJson(entries: HistoryEntry[]) {
  // 导出时保留 key（用户自己机器），便于复盘。
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-test-history-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryPanel({ entries, persist, onTogglePersist, onClear, onLaunched }: Props) {
  const { t } = useI18n();
  return (
    <section class="panel">
      <h2>{t("history.title")}</h2>
      <div class="history-controls">
        <label class="toggle">
          <input type="checkbox" checked={persist} onChange={(e) => onTogglePersist((e.target as HTMLInputElement).checked)} />
          {t("history.persist")}
        </label>
        <span class="spacer" />
        <button disabled={!entries.length} onClick={() => exportJson(entries)}>{t("history.exportJson")}</button>
        <button disabled={!entries.length} onClick={onClear}>{t("history.clear")}</button>
      </div>

      {!persist ? (
        <div class="status-text" style="margin-bottom:8px">
          {t("history.persistOff")}
        </div>
      ) : null}

      <table class="models">
        <thead>
          <tr>
            <th>{t("history.colTime")}</th>
            <th>{t("history.colProvider")}</th>
            <th>{t("history.colUrl")}</th>
            <th>{t("history.colKey")}</th>
            <th>{t("history.colModel")}</th>
            <th>{t("history.colStatus")}</th>
            <th class="num">{t("history.colLatency")}</th>
            <th class="num">{t("history.colTtft")}</th>
            <th class="num">{t("history.colTokens")}</th>
            <th>{t("history.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={10} class="empty">{t("history.empty")}</td></tr>
          ) : (
            entries.map((h) => {
              const requestUrl = h.result.requestUrl || h.baseUrl;
              const g = streamGlyph(h.streamVerdict);
              return (
                <tr key={h.id}>
                  <td class="status-text">{fmtTime(h.ts)}</td>
                  <td>{h.providerName}</td>
                  <td>
                    <span class="copy-pair">
                      <span
                        class="url-cell"
                        title={t("history.urlTitle", { requestUrl, baseUrl: h.baseUrl, full: h.isFullUrl ? t("history.urlFull") : "" })}
                      >
                        {requestUrl}
                      </span>
                      <CopyButton value={requestUrl} title={t("history.copyUrlTitle")} />
                    </span>
                  </td>
                  <td>
                    <span class="copy-pair">
                      <span class="mask">{maskKey(h.apiKey) || "—"}</span>
                      {h.apiKey ? <CopyButton value={h.apiKey} title={t("conn.copyKey")} /> : null}
                    </span>
                  </td>
                  <td>
                    <span class="model-name" title={h.protocol}>{h.modelLabel}</span>{" "}
                    <span class={"pbadge " + (h.result.ok ? "success" : "fail")} title={h.protocol}>
                      <span class="pbadge-label">{PROTOCOL_LABEL[h.protocol]}</span>
                      {g ? <span class={"stream-mark " + g.cls}>{g.char}</span> : null}
                    </span>
                  </td>
                  <td>
                    <span class={"status-cell" + (!h.result.ok && (h.result.failureLog || h.result.error) ? " has-pop" : "")}>
                      <span class={"status-text" + (h.result.ok ? "" : " fail")}>
                        <span class={"dot " + (h.result.ok ? "success" : "fail")} />
                        {h.result.ok ? t("history.pass") : t("history.fail", { status: h.result.status || "—" })}
                      </span>
                      {!h.result.ok && (h.result.failureLog || h.result.error) ? (
                        <div class="failure-pop"><pre>{h.result.failureLog || h.result.error}</pre></div>
                      ) : null}
                    </span>
                  </td>
                  <td class="num">{fmtMs(h.result.latencyMs)}</td>
                  <td class="num">{fmtMs(h.result.ttftMs)}</td>
                  <td class="num">
                    {fmtTok(h.result.usage.inputTokens)}/{fmtTok(h.result.usage.outputTokens)}/{fmtTok(h.result.usage.totalTokens)}
                  </td>
                  <td>
                    {h.result.ok ? (
                      <CcSwitchButton
                        name={`${h.providerName} - ${h.modelLabel}`}
                        endpoint={h.baseUrl}
                        apiKey={h.apiKey}
                        model={h.model}
                        defaultApp={PROTOCOL_TO_APP[h.protocol]}
                        onLaunched={onLaunched}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
