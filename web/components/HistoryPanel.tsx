import { useState } from "preact/hooks";
import { ChevronRight, Download, FileText, Search, Trash2 } from "lucide-preact";
import type { HistoryEntry } from "../lib/types.js";
import { fmtMs, fmtTok, fmtTime, PROTOCOL_LABEL } from "../lib/format.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { maskKey } from "../lib/storage.js";
import { StatusMark } from "./StatusMark.js";
import { CopyButton } from "./CopyButton.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { ActionMenu } from "./ActionMenu.js";
import { useI18n } from "../lib/i18n.js";
import { useMediaQuery } from "./useMediaQuery.js";

function exportJson(entries: HistoryEntry[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `llm-test-history-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function HistoryPanel({
  entries,
  onClear,
  onLaunched,
}: {
  entries: HistoryEntry[];
  onClear: () => void;
  onLaunched: (msg: string, opts?: { tone?: "info" | "error"; ms?: number }) => void;
}) {
  const { t } = useI18n();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const filtered = entries.filter(
    (h) =>
      `${h.providerName} ${h.modelLabel} ${h.model} ${h.protocol}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" || (filter === "success") === h.result.ok),
  );
  const dateCounts = new Map<string, number>();
  for (const entry of filtered) {
    const date = new Date(entry.ts).toDateString();
    dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
  }
  const toggle = (setter: typeof setExpanded, id: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const filterControl = (
    <label class="menu-field">
      {t("ui.allResults")}
      <select aria-label={t("ui.allResults")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
        <option value="all">{t("ui.allResults")}</option>
        <option value="success">{t("ui.passed")}</option>
        <option value="fail">{t("ui.failed")}</option>
      </select>
    </label>
  );
  return (
    <section class="panel history-panel" aria-labelledby="history-heading">
      <div class="history-intro">
        <h2 id="history-heading">{t("history.title")}</h2>
        <span class="muted">
          {t("history.sessionOnly")} · {entries.length}
        </span>
      </div>
      <div class="history-controls">
        <label class="search-control">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t("ui.searchHistory")}
            aria-label={t("ui.searchHistory")}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>
        <span class="desktop-filter">{filterControl}</span>
        <button class="primary" disabled={!entries.length} onClick={() => exportJson(entries)}>
          <Download size={16} aria-hidden="true" />
          {t("history.exportJson")}
        </button>
        <button class="danger-quiet desktop-clear" disabled={!entries.length} onClick={() => setConfirmClear(true)}>
          <Trash2 size={16} />
          {t("history.clear")}
        </button>
        <span class="mobile-history-menu">
          <ActionMenu label={t("ui.more")}>
            {filterControl}
            <button class="danger-quiet" disabled={!entries.length} onClick={() => setConfirmClear(true)}>
              <Trash2 size={16} />
              {t("history.clear")}
            </button>
          </ActionMenu>
        </span>
      </div>
      <div class="table-frame">
        <table class="models history-table">
          <thead>
            <tr>
              <th>{t("history.colProvider")}</th>
              <th>{t("history.colModel")}</th>
              <th>{t("history.colStatus")}</th>
              <th>{t("history.colLatency")}</th>
              <th>{t("history.colTtft")}</th>
              <th>{t("history.colTokens")}</th>
              <th>{t("history.colTime")}</th>
              <th>{t("history.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={8} class="empty">
                  {t(entries.length ? "ui.noMatch" : "history.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((h, index) => {
                const open = expanded.has(h.id);
                const ttft = h.streamTtftMs ?? h.result.ttftMs;
                const failureLog = h.result.failureLog || h.result.error || "";
                return (
                  <>
                    {index === 0 ||
                    new Date(filtered[index - 1].ts).toDateString() !== new Date(h.ts).toDateString() ? (
                      <tr class="history-date-group">
                        <td colSpan={8}>
                          {new Date(h.ts).toLocaleDateString("sv-SE")}{" "}
                          <span class="muted">
                            {t("ui.recordsCount", {
                              count: dateCounts.get(new Date(h.ts).toDateString()) ?? 0,
                            })}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      key={h.id}
                      class={"history-entry" + (open ? " expanded" : "") + (h.result.ok ? " success" : " fail")}
                    >
                      <td class="history-provider">
                        <button
                          class="icon-button subtle"
                          aria-expanded={open}
                          aria-controls={`history-detail-${h.id}`}
                          aria-label={open ? t("ui.collapse") : t("ui.details")}
                          onClick={() => toggle(setExpanded, h.id)}
                        >
                          <ChevronRight class={open ? "turned" : ""} size={16} />
                        </button>
                        <span>{h.providerName}</span>
                      </td>
                      <td class="history-model">
                        <strong class="model-name">{h.modelLabel}</strong>
                        <span class="proto-tag" title={h.protocol}>
                          {PROTOCOL_LABEL[h.protocol]}
                        </span>
                      </td>
                      <td class="history-result">
                        <span class={"model-verdict " + (h.result.ok ? "success" : "fail")}>
                          <StatusMark state={h.result.ok ? "success" : "fail"} />
                          {h.result.ok ? t("ui.passed") : t("history.fail", { status: h.result.status || "—" })}
                        </span>
                      </td>
                      <td class="history-latency num">
                        <small>{t("history.colLatency")}</small>
                        {fmtMs(h.result.latencyMs)}
                      </td>
                      <td class="history-ttft num">
                        <small>TTFT</small>
                        {fmtMs(ttft)}
                      </td>
                      <td class="history-tokens num">
                        <small>Token</small>
                        {fmtTok(h.result.usage.inputTokens)} / {fmtTok(h.result.usage.outputTokens)} /{" "}
                        {fmtTok(h.result.usage.totalTokens)}
                      </td>
                      <td class="history-time muted">{fmtTime(h.ts, mobile)}</td>
                      <td class="history-actions">
                        <ActionMenu label={`${t("ui.more")} · ${h.modelLabel}`}>
                          <button onClick={() => toggle(setExpanded, h.id)}>
                            {open ? t("ui.collapse") : t("ui.details")}
                          </button>
                          <CopyButton value={h.result.requestUrl || h.baseUrl} title={t("history.copyUrlTitle")} />
                          <CopyButton value={h.apiKey} title={t("conn.copyKey")} />
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
                        </ActionMenu>
                      </td>
                    </tr>
                    {open ? (
                      <tr key={`detail-${h.id}`} class="history-detail-row">
                        <td colSpan={8}>
                          <div
                            id={`history-detail-${h.id}`}
                            class={"history-inline-details " + (h.result.ok ? "success" : "fail")}
                          >
                            <div class="mobile-history-metrics">
                              <span>
                                {t("history.colLatency")}
                                <strong>{fmtMs(h.result.latencyMs)}</strong>
                              </span>
                              <span>
                                {t("history.colTtft")}
                                <strong>{fmtMs(ttft)}</strong>
                              </span>
                              <span>
                                Token
                                <strong>
                                  {fmtTok(h.result.usage.inputTokens)} / {fmtTok(h.result.usage.outputTokens)} /{" "}
                                  {fmtTok(h.result.usage.totalTokens)}
                                </strong>
                              </span>
                            </div>
                            {!h.result.ok ? (
                              <div class="history-failure-callout">
                                <StatusMark state="fail" />
                                <div>
                                  <strong>
                                    {mobile
                                      ? h.result.status === 401 || h.result.status === 403
                                        ? t("ui.checkKeyPermissions")
                                        : h.result.error
                                      : `HTTP ${h.result.status || "—"} · ${h.result.error}`}
                                  </strong>
                                  <small>
                                    {t(
                                      h.result.status === 401 || h.result.status === 403
                                        ? "ui.checkKeyPermissions"
                                        : "ui.viewResponse",
                                    )}
                                  </small>
                                </div>
                                <span class="spacer" />
                                <CopyButton value={failureLog} title={t("ui.copyLog")} showLabel />
                              </div>
                            ) : null}
                            <details class="history-connection-details" open={!mobile || h.result.ok}>
                              <summary>{t("ui.moreConnection")}</summary>
                              <div class="detail-field">
                                <span>Base URL</span>
                                <code>{h.baseUrl}</code>
                                <CopyButton value={h.baseUrl} title={t("history.copyUrlTitle")} />
                              </div>
                              <div class="detail-field">
                                <span>API Key</span>
                                <code>{revealed.has(h.id) ? h.apiKey : maskKey(h.apiKey)}</code>
                                <button class="compact-button" onClick={() => toggle(setRevealed, h.id)}>
                                  {t(revealed.has(h.id) ? "conn.hide" : "conn.show")}
                                </button>
                                <CopyButton value={h.apiKey} title={t("conn.copyKey")} />
                              </div>
                              {h.userAgent ? (
                                <div class="detail-field">
                                  <span>User-Agent</span>
                                  <code>{h.userAgent}</code>
                                  <CopyButton value={h.userAgent} title="User-Agent" />
                                </div>
                              ) : null}
                              <details class="history-response" open={!mobile}>
                                <summary>
                                  <FileText size={16} />
                                  {t(h.result.ok ? "ui.viewResponse" : "ui.failureLog")}
                                </summary>
                                <details class="history-request">
                                  <summary>{t("ui.url")}</summary>
                                  <div class="detail-field request-url-field">
                                    <span>{t("ui.url")}</span>
                                    <code>{h.result.requestUrl || h.baseUrl}</code>
                                    <CopyButton
                                      value={h.result.requestUrl || h.baseUrl}
                                      title={t("history.copyUrlTitle")}
                                    />
                                  </div>
                                </details>
                                <div class="detail-heading">
                                  <strong>{t(h.result.ok ? "ui.response" : "ui.failureLog")}</strong>
                                  <CopyButton value={h.result.ok ? h.result.text : failureLog} title={t("ui.more")} />
                                </div>
                                <pre>{h.result.ok ? h.result.text : failureLog}</pre>
                              </details>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div class="history-list-footer">
        <span>{t("ui.recordsCount", { count: filtered.length })}</span>
        <span class="success">{t("ui.passedCount", { count: filtered.filter((h) => h.result.ok).length })}</span>
        <span class="fail">{t("ui.failedCount", { count: filtered.filter((h) => !h.result.ok).length })}</span>
      </div>
      {confirmClear ? (
        <ConfirmModal
          title={t("ui.clearHistoryTitle")}
          description={t("ui.clearHistoryBody")}
          confirmLabel={t("history.clear")}
          onClose={() => setConfirmClear(false)}
          onConfirm={() => {
            onClear();
            setConfirmClear(false);
            setExpanded(new Set());
          }}
        />
      ) : null}
    </section>
  );
}
