import { useEffect, useRef, useState } from "preact/hooks";
import { BarChart3, Eye, EyeOff, File, Info, KeyRound, Network, RefreshCw, Search, Trash2, X } from "lucide-preact";
import type { PingResult, StatusEntry } from "../lib/types.js";
import { pingEndpoint } from "../lib/api.js";
import { runConcurrent } from "../lib/concurrency.js";
import { PROTOCOL_LABEL, fmtMs, fmtTime } from "../lib/format.js";
import { maskKey } from "../lib/storage.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { useI18n } from "../lib/i18n.js";
import { StatusMark } from "./StatusMark.js";
import { CopyButton } from "./CopyButton.js";
import { ActionMenu } from "./ActionMenu.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import { FREE_WORKER_SOFT_CAP, dailyPingRequests, isOverFreeCap, safestInterval } from "../lib/status-budget.js";

interface Props {
  entries: StatusEntry[];
  persisted: boolean;
  onDelete: (ids: string[]) => void;
  onGotoTest: (entry: StatusEntry) => void;
  onLaunched: (msg: string, opts?: { tone?: "info" | "error"; ms?: number }) => void;
}

type PingState = {
  status: "idle" | "pinging" | "done";
  result?: PingResult;
  ts?: number;
  cancelled?: boolean;
};

const AUTO_OPTIONS = [0, 30, 60, 300] as const;

function intervalLabelKey(sec: number): string {
  return `status.auto${sec}`;
}

export function StatusPanel({ entries, persisted, onDelete, onGotoTest, onLaunched }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pings, setPings] = useState<Record<string, PingState>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [autoSec, setAutoSec] = useState<number>(0);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const autoSecRef = useRef(autoSec);
  autoSecRef.current = autoSec;

  const filtered = entries.filter((entry) =>
    `${entry.providerName} ${entry.baseUrl} ${entry.model}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allChecked = filtered.length > 0 && filtered.every((entry) => checked.has(entry.id));
  const someChecked = checked.size > 0;
  const estimated = dailyPingRequests(entries.length, autoSec);
  const overCap = autoSec > 0 && isOverFreeCap(entries.length, autoSec);
  const lastChecked = Math.max(0, ...Object.values(pings).map((ping) => ping.ts ?? 0));
  const checkedCount = entries.filter((entry) => pings[entry.id]?.result).length;
  const healthyCount = entries.filter((entry) => pings[entry.id]?.result?.ok).length;
  const warningCount = entries.filter((entry) => pings[entry.id]?.result && !pings[entry.id].result?.ok).length;
  const uncheckedCount = entries.length - checkedCount;
  const budgetRequests = autoSec > 0 ? estimated : 0;
  const budgetPct = Math.round((budgetRequests / FREE_WORKER_SOFT_CAP) * 10000) / 100;

  const refresh = async (targets: StatusEntry[]) => {
    if (busyRef.current || targets.length === 0) return;
    const controller = new AbortController();
    busyRef.current = true;
    abortRef.current = controller;
    setBusy(true);
    setProgress({ completed: 0, total: targets.length });
    setPings((prev) => {
      const next = { ...prev };
      for (const entry of targets) {
        next[entry.id] = { ...next[entry.id], status: "pinging", cancelled: false };
      }
      return next;
    });

    try {
      await runConcurrent(
        targets,
        3,
        controller.signal,
        async (entry, signal) => {
          const result = await pingEndpoint(
            {
              protocol: entry.protocol,
              baseUrl: entry.baseUrl,
              isFullUrl: entry.isFullUrl,
              apiKey: entry.apiKey,
              model: entry.model,
              userAgent: entry.userAgent,
            },
            signal,
          );
          if (signal.aborted) return;
          setPings((prev) => ({
            ...prev,
            [entry.id]: { status: "done", result, ts: Date.now() },
          }));
        },
        () => setProgress((prev) => ({ ...prev, completed: prev.completed + 1 })),
      );
    } catch (e: any) {
      if (!controller.signal.aborted) {
        onLaunched(t("status.refreshFailed", { msg: e?.message ?? e }), { tone: "error" });
      }
    } finally {
      setPings((previous) => {
        const next = { ...previous };
        for (const entry of targets)
          if (next[entry.id]?.status === "pinging")
            next[entry.id] = { status: "idle", cancelled: controller.signal.aborted };
        return next;
      });
      if (abortRef.current === controller) abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  const selectedEntries = () => entries.filter((entry) => checked.has(entry.id));
  const toggleAll = () => {
    setChecked((current) => {
      const next = new Set(current);
      for (const entry of filtered) {
        if (allChecked) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };

  const trySetAutoSec = (sec: number) => {
    if (sec > 0 && isOverFreeCap(entries.length, sec)) {
      const safe = safestInterval(entries.length, AUTO_OPTIONS);
      const requests = dailyPingRequests(entries.length, sec);
      setAutoSec(safe);
      onLaunched(
        safe > 0
          ? t("status.autoOverCap", { cap: FREE_WORKER_SOFT_CAP, requests }) +
              " " +
              t("status.autoDowngraded", { interval: t(intervalLabelKey(safe)) })
          : t("status.autoOverCap", { cap: FREE_WORKER_SOFT_CAP, requests }),
        { tone: "error" },
      );
      return;
    }
    setAutoSec(sec);
  };

  // 条目变多后若当前间隔超 cap，自动降到安全间隔。
  useEffect(() => {
    const current = autoSecRef.current;
    if (!current || !isOverFreeCap(entries.length, current)) return;
    const safe = safestInterval(entries.length, AUTO_OPTIONS);
    setAutoSec(safe);
    onLaunched(
      t("status.autoDowngraded", {
        interval: safe > 0 ? t(intervalLabelKey(safe)) : t("status.auto0"),
      }),
      { tone: "info" },
    );
  }, [entries.length]);

  useEffect(() => {
    const ids = new Set(entries.map((entry) => entry.id));
    setChecked((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setPings((prev) => {
      const next: Record<string, PingState> = {};
      for (const id of Object.keys(prev)) {
        if (ids.has(id)) next[id] = prev[id];
      }
      return next;
    });
  }, [entries]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!autoSec || !visible) return;
    if (isOverFreeCap(entries.length, autoSec)) return;
    const timer = setInterval(() => {
      if (!busyRef.current && entries.length > 0) void refresh(entries);
    }, autoSec * 1000);
    return () => clearInterval(timer);
  }, [autoSec, entries, visible]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const search = (
    <label class="search-control">
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={query}
        placeholder={t("ui.searchStatus")}
        aria-label={t("ui.searchStatus")}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
    </label>
  );
  return (
    <section class="panel status-panel">
      <div class="page-section-head">
        <h2>{t("status.title")}</h2>
        <span class="muted">{!persisted ? t("status.memoryOnly") : t("ui.statusSubtitle")}</span>
      </div>
      <div class="status-summary-grid" aria-label={t("status.title")}>
        {[
          ["ui.savedEndpoints", entries.length, "idle"],
          ["ui.available", healthyCount, "success"],
          ["ui.abnormal", warningCount, "fail"],
          ["ui.pending", uncheckedCount, "idle"],
        ].map(([label, count, tone], i) => (
          <div key={i} class={"status-summary-card " + tone}>
            {i === 0 ? (
              <File class="summary-file" size={24} />
            ) : (
              <StatusMark state={tone as "success" | "fail" | "idle"} />
            )}
            <div>
              <span>{t(String(label))}</span>
              <strong>{count}</strong>
            </div>
          </div>
        ))}
        <div class="status-provider-count">
          <Network size={26} />
          <span>{t("ui.providerCount", { count: new Set(entries.map((e) => e.providerName)).size })}</span>
        </div>
      </div>
      <details class={"status-budget-card" + (overCap ? " danger" : "")}>
        <summary>
          <BarChart3 class="budget-icon" size={26} />
          <div class="budget-heading">
            <strong>
              {t("ui.budgetTitle")} <Info size={16} />
            </strong>
            <small>{t("ui.budgetBody", { count: entries.length, seconds: autoSec })}</small>
          </div>
          <span class="budget-number">
            {t("ui.budgetTotal", { count: budgetRequests.toLocaleString() })}
            <span class="budget-mobile-percent"> · {budgetPct}%</span>
          </span>
          <div class="budget-meter">
            <progress max={FREE_WORKER_SOFT_CAP} value={budgetRequests} aria-label={t("ui.budgetTitle")} />
            <span>
              {budgetRequests.toLocaleString()} / {FREE_WORKER_SOFT_CAP.toLocaleString()} · {budgetPct}%
            </span>
          </div>
          <span class={"budget-verdict " + (overCap ? "fail" : "success")}>
            <StatusMark state={overCap ? "fail" : "success"} />
            {t(overCap ? "ui.budgetOver" : "ui.budgetWithin")}
          </span>
        </summary>
        <div class="budget-detail">
          <p>{t("ui.budgetBody", { count: entries.length, seconds: autoSec })}</p>
        </div>
      </details>
      <div class="status-toolbar">
        {busy ? (
          <button class="danger" onClick={() => abortRef.current?.abort()}>
            <X size={16} />
            {t("common.cancel")}
          </button>
        ) : (
          <button class="primary" disabled={!entries.length} onClick={() => void refresh(entries)}>
            <RefreshCw size={16} />
            {t("status.refreshAll")}
          </button>
        )}
        <span class="status-desktop-selected">
          <button disabled={busy || !someChecked} onClick={() => void refresh(selectedEntries())}>
            {t("status.refreshSelected")}
          </button>
        </span>
        <label class="select-visible">
          <input type="checkbox" checked={allChecked} disabled={busy || !filtered.length} onChange={toggleAll} />
          {t("common.selectAll")}
        </label>
        <label class="status-auto">
          <span>{t("status.autoRefresh")}</span>
          <select
            aria-label={t("status.autoRefresh")}
            value={String(autoSec)}
            disabled={busy}
            onChange={(e) => trySetAutoSec(Number(e.currentTarget.value))}
          >
            {AUTO_OPTIONS.map((sec) => (
              <option key={sec} value={String(sec)}>
                {t(intervalLabelKey(sec))}
              </option>
            ))}
          </select>
        </label>
        <span class="status-last-check">
          {t("ui.lastChecked")} {lastChecked ? fmtTime(lastChecked, false).slice(0, 5) : t("common.dash")}
        </span>
        <span class="status-desktop-search">{search}</span>
        <ActionMenu label={t("ui.bulkActions")} showLabel>
          <span class="status-mobile-search">{search}</span>
          <button disabled={busy || !someChecked} onClick={() => void refresh(selectedEntries())}>
            {t("status.refreshSelected")}
          </button>
          <button class="danger-quiet" disabled={busy || !someChecked} onClick={() => setPendingDelete([...checked])}>
            <Trash2 size={16} />
            {t("status.deleteSelected")}
          </button>
        </ActionMenu>
      </div>
      {busy ? (
        <div class="batch-progress" aria-live="polite">
          <span>{t("models.progress", progress)}</span>
          <progress
            max={Math.max(1, progress.total)}
            value={progress.completed}
            aria-label={t("models.progress", progress)}
          />
        </div>
      ) : null}
      <div class="table-frame">
        <table class="models status-table">
          <thead>
            <tr>
              <th aria-label={t("common.selectAll")} />
              <th>{t("status.colProvider")}</th>
              <th>{t("status.colModel")}</th>
              <th>{t("status.colResult")}</th>
              <th>{t("status.colLatency")}</th>
              <th>{t("status.colKind")}</th>
              <th>{t("status.colCheckedAt")}</th>
              <th>{t("status.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={8} class="empty">
                  {t(entries.length ? "ui.noMatch" : "status.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const ping = pings[entry.id] ?? { status: "idle" as const };
                const result = ping.result;
                const keyShown = revealed.has(entry.id);
                const keyTools = (
                  <div class="status-key-tools">
                    <KeyRound size={14} aria-hidden="true" />
                    <code class="mask">{keyShown ? entry.apiKey : maskKey(entry.apiKey)}</code>
                    <button
                      class="compact-button"
                      aria-label={t(keyShown ? "conn.hide" : "conn.show")}
                      onClick={() =>
                        setRevealed((current) => {
                          const next = new Set(current);
                          if (keyShown) next.delete(entry.id);
                          else next.add(entry.id);
                          return next;
                        })
                      }
                    >
                      {keyShown ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <CopyButton value={entry.apiKey} title={t("conn.copyKey")} />
                  </div>
                );
                return (
                  <tr key={entry.id} class="status-entry">
                    <td class="status-check">
                      <label class="row-check">
                        <input
                          type="checkbox"
                          checked={checked.has(entry.id)}
                          disabled={busy}
                          aria-label={entry.model}
                          onChange={(e) => {
                            const on = e.currentTarget.checked;
                            setChecked((current) => {
                              const next = new Set(current);
                              if (on) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            });
                          }}
                        />
                      </label>
                    </td>
                    <td class="status-identity">
                      <strong>{entry.providerName || t("common.custom")}</strong>
                      <div class="url-cell" title={entry.baseUrl}>
                        {entry.baseUrl}
                      </div>
                      <div class="status-desktop-key">{keyTools}</div>
                    </td>
                    <td class="status-model-cell">
                      <span class="mono status-model">{entry.model}</span>
                      <span class="proto-tag">{PROTOCOL_LABEL[entry.protocol]}</span>
                    </td>
                    <td class="status-result-cell">
                      <span
                        class={
                          "model-verdict " +
                          (ping.status === "pinging" ? "testing" : result?.ok ? "success" : result ? "fail" : "idle")
                        }
                      >
                        <StatusMark
                          state={
                            ping.status === "pinging" ? "testing" : result?.ok ? "success" : result ? "fail" : "idle"
                          }
                        />
                        {ping.status === "pinging"
                          ? t("status.pinging")
                          : ping.cancelled
                            ? t("ui.cancelled")
                            : result?.ok
                              ? t("ui.available")
                              : result
                                ? `HTTP ${result.status || "—"} ${t("ui.abnormal")}`
                                : t("ui.pending")}
                      </span>
                      {result?.error ? (
                        <details class="status-error">
                          <summary>{t("history.failureDetails")}</summary>
                          <p>{result.error}</p>
                        </details>
                      ) : null}
                    </td>
                    <td class="status-latency num">
                      <small>{t("status.colLatency")}</small>
                      {fmtMs(result?.latencyMs ?? null)}
                    </td>
                    <td class="status-kind">
                      {result
                        ? t(result.kind === "models" ? "status.kindModels" : "status.kindCompletion")
                        : t("common.dash")}
                    </td>
                    <td class="status-time muted">{ping.ts ? fmtTime(ping.ts) : t("common.dash")}</td>
                    <td class="status-row-actions">
                      <button class="compact-button" onClick={() => onGotoTest(entry)}>
                        {t("status.gotoTest")}
                      </button>
                      <ActionMenu label={`${t("ui.more")} · ${entry.model}`}>
                        <span class="status-mobile-key">{keyTools}</span>
                        <CopyButton value={entry.baseUrl} title={t("history.copyUrlTitle")} />
                        <span class="muted">
                          {result
                            ? t(result.kind === "models" ? "status.kindModels" : "status.kindCompletion")
                            : t("ui.pending")}
                        </span>
                        <CcSwitchButton
                          name={`${entry.providerName} - ${entry.model}`}
                          endpoint={entry.baseUrl}
                          apiKey={entry.apiKey}
                          model={entry.model}
                          defaultApp={PROTOCOL_TO_APP[entry.protocol]}
                          onLaunched={onLaunched}
                        />
                        <button class="danger-quiet" disabled={busy} onClick={() => setPendingDelete([entry.id])}>
                          <Trash2 size={16} />
                          {t("common.remove")}
                        </button>
                      </ActionMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div class="status-footer muted">
        <span>
          <Info size={16} />
          {visible ? t("ui.refreshPaused") : t("status.autoPausedHidden")}
        </span>
        <span>{t("ui.checkedCount", { completed: checkedCount, total: entries.length })}</span>
      </div>
      {pendingDelete ? (
        <ConfirmModal
          title={t("status.deleteSelected")}
          description={t("status.confirmDelete", { count: pendingDelete.length })}
          confirmLabel={t("common.remove")}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete);
            setPendingDelete(null);
          }}
        />
      ) : null}
    </section>
  );
}
