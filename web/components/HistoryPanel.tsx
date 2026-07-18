import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { Ban, Download, Equal, RadioTower, Trash2 } from "lucide-preact";
import type { HistoryEntry } from "../lib/types.js";
import { fmtMs, fmtTok, fmtTime, PROTOCOL_LABEL } from "../lib/format.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { CopyButton } from "./CopyButton.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { useI18n } from "../lib/i18n.js";

interface Props {
  entries: HistoryEntry[];
  onClear: () => void;
  onLaunched: (msg: string, opts?: { tone?: "info" | "error"; ms?: number }) => void;
}

interface FailurePopoverState {
  id: string;
  detail: string;
  anchor: HTMLButtonElement;
  pinned: boolean;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

function failurePopoverId(id: string): string {
  return `history-failure-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function placeFailurePopover(
  id: string,
  detail: string,
  anchor: HTMLButtonElement,
  pinned: boolean,
): FailurePopoverState {
  const margin = 12;
  const gap = 8;
  const rect = anchor.getBoundingClientRect();
  const availableWidth = Math.max(160, window.innerWidth - margin * 2);
  const width = Math.min(520, availableWidth);
  const left = Math.min(
    Math.max(margin, rect.left),
    Math.max(margin, window.innerWidth - margin - width),
  );
  const roomBelow = Math.max(48, window.innerHeight - rect.bottom - gap - margin);
  const roomAbove = Math.max(48, rect.top - gap - margin);
  const above = roomBelow < 220 && roomAbove > roomBelow;
  const maxHeight = Math.min(360, above ? roomAbove : roomBelow);
  return {
    id,
    detail,
    anchor,
    pinned,
    left,
    top: above ? rect.top - gap : rect.bottom + gap,
    width,
    maxHeight,
    above,
  };
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

export function HistoryPanel({ entries, onClear, onLaunched }: Props) {
  const { t } = useI18n();
  const [failurePopover, setFailurePopover] = useState<FailurePopoverState | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPopoverClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const schedulePopoverClose = () => {
    cancelPopoverClose();
    closeTimerRef.current = setTimeout(() => {
      setFailurePopover((current) => current?.pinned ? current : null);
    }, 120);
  };

  const showFailurePopover = (
    id: string,
    detail: string,
    anchor: HTMLButtonElement,
    pinned: boolean,
  ) => {
    cancelPopoverClose();
    setFailurePopover((current) => {
      if (!pinned && current?.pinned) return current;
      if (pinned && current?.id === id && current.pinned) return null;
      return placeFailurePopover(id, detail, anchor, pinned);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFailurePopover(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelPopoverClose();
    };
  }, []);

  useEffect(() => {
    if (!failurePopover) return;
    const reposition = () => {
      setFailurePopover((current) => current
        ? placeFailurePopover(current.id, current.detail, current.anchor, current.pinned)
        : null);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [failurePopover?.id]);

  return (
    <>
      <section class="panel history-panel" aria-labelledby="history-heading">
      <h2 id="history-heading" class="sr-only">{t("history.title")}</h2>
      <div class="history-controls">
        <span class="status-text">{t("history.sessionOnly")}</span>
        <span class="spacer" />
        <button disabled={!entries.length} onClick={() => exportJson(entries)}><Download size={16} aria-hidden="true" />{t("history.exportJson")}</button>
        <button class="danger-quiet" disabled={!entries.length} onClick={onClear}><Trash2 size={16} aria-hidden="true" />{t("history.clear")}</button>
      </div>

      <div class="table-frame">
      <table class="models history-table">
        <thead>
          <tr>
            <th>{t("history.colProvider")}</th>
            <th>{t("history.colModel")}</th>
            <th>{t("history.colStatus")}</th>
            <th class="num">{t("history.colLatency")}</th>
            <th class="num" data-col="ttft">{t("history.colTtft")}</th>
            <th class="num" data-col="tokens">{t("history.colTokens")}</th>
            <th>{t("history.colActions")}</th>
            <th class="history-copy-column" data-col="url">{t("history.colUrl")}</th>
            <th class="history-copy-column" data-col="key">{t("history.colKey")}</th>
            <th data-col="time">{t("history.colTime")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={10} class="empty">{t("history.empty")}</td></tr>
          ) : (
            entries.map((h) => {
              const requestUrl = h.result.requestUrl || h.baseUrl;
              const StreamIcon = h.streamVerdict === "stream" ? RadioTower : h.streamVerdict === "single" ? Equal : h.streamVerdict === "none" ? Ban : null;
              const detail = !h.result.ok ? (h.result.failureLog || h.result.error || "") : "";
              const hasPop = Boolean(detail);
              const popoverVisible = failurePopover?.id === h.id;
              return (
                <tr key={h.id}>
                  <td>{h.providerName}</td>
                  <td>
                    <span class="model-name" title={h.protocol}>{h.modelLabel}</span>{" "}
                    <span class={"pbadge " + (h.result.ok ? "success" : "fail")} title={h.protocol}>
                      <span class="pbadge-label">{PROTOCOL_LABEL[h.protocol]}</span>
                      {StreamIcon ? <StreamIcon class={"stream-icon " + h.streamVerdict} size={12} aria-hidden="true" /> : null}
                    </span>
                  </td>
                  <td>
                    <span class={"status-cell" + (hasPop ? " has-pop" : "")}>
                      {hasPop ? (
                        <button
                          type="button"
                          class="status-pop-trigger"
                          aria-expanded={popoverVisible}
                          aria-describedby={popoverVisible ? failurePopoverId(h.id) : undefined}
                          aria-label={t("history.failureDetails")}
                          onMouseEnter={(e) => showFailurePopover(h.id, detail, e.currentTarget as HTMLButtonElement, false)}
                          onMouseLeave={schedulePopoverClose}
                          onFocus={(e) => showFailurePopover(h.id, detail, e.currentTarget as HTMLButtonElement, false)}
                          onBlur={schedulePopoverClose}
                          onClick={(e) => {
                            e.stopPropagation();
                            showFailurePopover(h.id, detail, e.currentTarget as HTMLButtonElement, true);
                          }}
                        >
                          <span class={"status-text" + (h.result.ok ? "" : " fail")}>
                            <span class={"dot " + (h.result.ok ? "success" : "fail")} />
                            {h.result.ok ? t("history.pass") : t("history.fail", { status: h.result.status || "—" })}
                          </span>
                        </button>
                      ) : (
                        <span class={"status-text" + (h.result.ok ? "" : " fail")}>
                          <span class={"dot " + (h.result.ok ? "success" : "fail")} />
                          {h.result.ok ? t("history.pass") : t("history.fail", { status: h.result.status || "—" })}
                        </span>
                      )}
                    </span>
                  </td>
                  <td class="num">{fmtMs(h.result.latencyMs)}</td>
                  <td class="num" data-col="ttft">{fmtMs(h.result.ttftMs)}</td>
                  <td class="num" data-col="tokens">
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
                  <td
                    class="history-copy-column"
                    data-col="url"
                    title={t("history.urlTitle", { requestUrl, baseUrl: h.baseUrl, full: h.isFullUrl ? t("history.urlFull") : "" })}
                  >
                    <CopyButton value={requestUrl} title={t("history.copyUrlTitle")} />
                  </td>
                  <td class="history-copy-column" data-col="key">
                    {h.apiKey ? <CopyButton value={h.apiKey} title={t("conn.copyKey")} /> : <span class="status-text">—</span>}
                  </td>
                  <td class="status-text history-time" data-col="time">{fmtTime(h.ts)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      </section>
      {failurePopover ? createPortal(
        <div
          id={failurePopoverId(failurePopover.id)}
          class={"failure-pop floating " + (failurePopover.above ? "above" : "below")}
          role="tooltip"
          style={`left:${failurePopover.left}px;top:${failurePopover.top}px;width:${failurePopover.width}px`}
          onMouseEnter={cancelPopoverClose}
          onMouseLeave={schedulePopoverClose}
        >
          <pre style={`max-height:${failurePopover.maxHeight}px`}>{failurePopover.detail}</pre>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
