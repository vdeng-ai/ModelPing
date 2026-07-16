import { useEffect, useRef, useState } from "preact/hooks";
import { CheckSquare, Gauge, RefreshCw, Square, Trash2, X } from "lucide-preact";
import type { PingResult, StatusEntry } from "../lib/types.js";
import { pingEndpoint } from "../lib/api.js";
import { runConcurrent } from "../lib/concurrency.js";
import { PROTOCOL_LABEL, fmtMs, fmtTime } from "../lib/format.js";
import { maskKey } from "../lib/storage.js";
import { PROTOCOL_TO_APP } from "../lib/ccswitch.js";
import { useI18n } from "../lib/i18n.js";
import { CcSwitchButton } from "./CcSwitchButton.js";
import {
  FREE_WORKER_SOFT_CAP,
  dailyPingRequests,
  isOverFreeCap,
  safestInterval,
} from "../lib/status-budget.js";

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
};

const AUTO_OPTIONS = [0, 30, 60, 300] as const;

function latencyClass(result?: PingResult): string {
  if (!result) return "idle";
  if (!result.ok) return "bad";
  if (result.latencyMs < 500) return "good";
  if (result.latencyMs < 1500) return "ok";
  return "slow";
}

function intervalLabelKey(sec: number): string {
  return `status.auto${sec}`;
}

export function StatusPanel({ entries, persisted, onDelete, onGotoTest, onLaunched }: Props) {
  const { t } = useI18n();
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

  const allChecked = entries.length > 0 && entries.every((entry) => checked.has(entry.id));
  const someChecked = checked.size > 0;
  const estimated = dailyPingRequests(entries.length, autoSec);
  const overCap = autoSec > 0 && isOverFreeCap(entries.length, autoSec);

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
        next[entry.id] = { ...next[entry.id], status: "pinging" };
      }
      return next;
    });

    try {
      await runConcurrent(
        targets,
        3,
        controller.signal,
        async (entry, signal) => {
          const result = await pingEndpoint({
            protocol: entry.protocol,
            baseUrl: entry.baseUrl,
            isFullUrl: entry.isFullUrl,
            apiKey: entry.apiKey,
            model: entry.model,
            userAgent: entry.userAgent,
          }, signal);
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
      if (abortRef.current === controller) abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  const selectedEntries = () => entries.filter((entry) => checked.has(entry.id));
  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(entries.map((entry) => entry.id)));
  };

  const trySetAutoSec = (sec: number) => {
    if (sec > 0 && isOverFreeCap(entries.length, sec)) {
      const safe = safestInterval(entries.length, AUTO_OPTIONS);
      const requests = dailyPingRequests(entries.length, sec);
      setAutoSec(safe);
      onLaunched(
        safe > 0
          ? t("status.autoOverCap", { cap: FREE_WORKER_SOFT_CAP, requests }) + " " + t("status.autoDowngraded", { interval: t(intervalLabelKey(safe)) })
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

  const onDeleteSelected = () => {
    const ids = [...checked];
    if (!ids.length) return;
    if (!confirm(t("status.confirmDelete", { count: ids.length }))) return;
    onDelete(ids);
    setChecked(new Set());
  };

  return (
    <section class="panel status-panel">
      <div class="page-section-head">
        <div>
          <span class="section-index">LIVE</span>
          <h2>{t("status.title")}</h2>
        </div>
        <span class="quota-badge"><Gauge size={15} aria-hidden="true" />{t("status.quotaProtected")}</span>
      </div>
      {!persisted ? <div class="hint fail status-memory">{t("status.memoryOnly")}</div> : null}

      <div class="status-toolbar">
        <button class="primary" disabled={busy || !someChecked} onClick={() => refresh(selectedEntries())}>
          <RefreshCw size={16} aria-hidden="true" />
          {t("status.refreshSelected")}
        </button>
        {busy ? <button class="danger" onClick={() => abortRef.current?.abort()}><X size={16} aria-hidden="true" />{t("common.cancel")}</button> : null}
        <button disabled={busy || entries.length === 0} onClick={() => refresh(entries)}>
          <RefreshCw size={16} aria-hidden="true" />
          {t("status.refreshAll")}
        </button>
        <button disabled={busy || entries.length === 0} onClick={toggleAll}>
          {allChecked ? <CheckSquare size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
          {allChecked ? t("common.deselectAll") : t("common.selectAll")}
        </button>
        <button class="danger" disabled={busy || !someChecked} onClick={onDeleteSelected}>
          <Trash2 size={16} aria-hidden="true" />
          {t("status.deleteSelected")}
        </button>
        <label class="status-auto">
          <span>{t("status.autoRefresh")}</span>
          <select
            value={String(autoSec)}
            disabled={busy}
            onChange={(e) => trySetAutoSec(Number((e.target as HTMLSelectElement).value))}
          >
            {AUTO_OPTIONS.map((sec) => <option value={String(sec)}>{t(intervalLabelKey(sec))}</option>)}
          </select>
        </label>
      </div>
      {autoSec ? (
        <div class={"hint status-auto-estimate" + (overCap ? " fail status-auto-warn" : "")}>
          {visible
            ? t("status.autoEstimate", { count: entries.length, requests: estimated })
            : t("status.autoPausedHidden")}
        </div>
      ) : null}

      {busy ? (
        <div class="batch-progress" aria-live="polite">
          <div class="batch-progress-label">
            <span>{t("models.progress", progress)}</span>
            <span>{Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%</span>
          </div>
          <progress max={Math.max(1, progress.total)} value={progress.completed} aria-label={t("models.progress", progress)} />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div class="empty">{t("status.empty")}</div>
      ) : (
        <div class="table-frame">
        <table class="models status-table">
          <thead>
            <tr>
              <th aria-label={t("common.selectAll")} />
              <th>{t("status.colProvider")}</th>
              <th>{t("status.colModel")}</th>
              <th>{t("status.colLatency")}</th>
              <th>{t("status.colKind")}</th>
              <th>{t("status.colCheckedAt")}</th>
              <th>{t("status.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const ping = pings[entry.id] ?? { status: "idle" as const };
              const result = ping.result;
              const level = latencyClass(result);
              const title = result?.error ? result.error : result ? `HTTP ${result.status}` : t("status.notChecked");
              return (
                <tr key={entry.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked.has(entry.id)}
                      onChange={(e) => {
                        const on = (e.target as HTMLInputElement).checked;
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(entry.id);
                          else next.delete(entry.id);
                          return next;
                        });
                      }}
                      aria-label={entry.model}
                    />
                  </td>
                  <td>
                    <div class="status-provider">{entry.providerName || t("common.custom")}</div>
                    <div class="url-cell" title={entry.baseUrl}>{entry.baseUrl}</div>
                    <div class="mask">{maskKey(entry.apiKey)}</div>
                  </td>
                  <td>
                    <div class="status-model">{entry.model}</div>
                    <span class="proto-tag">{PROTOCOL_LABEL[entry.protocol]}</span>
                  </td>
                  <td>
                    {ping.status === "pinging" ? (
                      <span class="pbadge testing">{t("status.pinging")}</span>
                    ) : (
                      <span class={"pbadge " + level} title={title}>
                        {result ? fmtMs(result.latencyMs) : t("common.dash")}
                      </span>
                    )}
                  </td>
                  <td>{result ? t(result.kind === "models" ? "status.kindModels" : "status.kindCompletion") : t("common.dash")}</td>
                  <td class="num">{ping.ts ? fmtTime(ping.ts) : t("common.dash")}</td>
                  <td>
                    <div class="status-actions">
                      <button type="button" class="icon" onClick={() => onGotoTest(entry)}>
                        {t("status.gotoTest")}
                      </button>
                      <CcSwitchButton
                        name={`${entry.providerName || t("common.custom")} - ${entry.model}`}
                        endpoint={entry.baseUrl}
                        apiKey={entry.apiKey}
                        model={entry.model}
                        defaultApp={PROTOCOL_TO_APP[entry.protocol]}
                        onLaunched={onLaunched}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
