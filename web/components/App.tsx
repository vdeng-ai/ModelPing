import { useEffect, useRef, useState } from "preact/hooks";
import type { ConfigState, Defaults, HistoryEntry, PresetsResponse, PrivateState, ProviderPreset, StatusEntry } from "../lib/types.js";
import { emptyPrivateState, fetchBootstrap, fetchPresets, isAuthError, savePrivateState, saveSettings, setAppPassword } from "../lib/api.js";
import { MAX_PRIVATE_HISTORY } from "../../src/private-state.js";
import {
  CUSTOM_PROVIDER_ID,
  FALLBACK_DEFAULTS,
  normalizeConcurrency,
  loadLocalPresets, saveLocalPresets,
} from "../lib/presets.js";
import { initTheme } from "../lib/theme.js";
import { ConnectionPanel, type ConnValue } from "./ConnectionPanel.js";
import { ConfigPanel } from "./ConfigPanel.js";
import { ModelTable } from "./ModelTable.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { LangToggle } from "./LangToggle.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { StatusPanel } from "./StatusPanel.js";
import { initLang, useI18n } from "../lib/i18n.js";
import { useDetect } from "./useDetect.js";
import { migrateLegacyPrivateState } from "../lib/storage.js";
import { appendCustomModelRows, buildRows, customModelIds, selectRowsForProvider, upsertCustomModelRows, type ModelRow } from "../lib/model-rows.js";
import {
  hasLegacyPrivateState,
  mergePrivateState,
  privateStateForScope,
  serializePrivateStateForScope,
  type PrivateStateScope,
} from "../lib/private-state-sync.js";
import { statusEntryKey } from "../lib/status-entries.js";

let statusSeq = 0;
const nextStatusId = () => `s${Date.now()}-${++statusSeq}`;

type StatusDraft = Omit<StatusEntry, "id">;

export function App() {
  const { t, lang } = useI18n();
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  const [presetDefaults, setPresetDefaults] = useState<Defaults>(FALLBACK_DEFAULTS);
  const [activeTab, setActiveTab] = useState<"test" | "status" | "settings">("test");
  const [conn, setConn] = useState<ConnValue>({ providerId: CUSTOM_PROVIDER_ID, baseUrl: "", isFullUrl: false, apiKey: "" });
  const [config, setConfig] = useState<ConfigState>({ input: "", timeoutMs: 30000, maxRetries: 1, maxTokens: 512, userAgent: "", concurrency: 2 });
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [statusEntries, setStatusEntries] = useState<StatusEntry[]>([]);
  const [statusPersisted, setStatusPersisted] = useState(true);
  const [customModelsPersist, setCustomModelsPersist] = useState(false);
  const [persist, setPersistState] = useState<boolean>(true);
  const [toast, setToast] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [securityWarn, setSecurityWarn] = useState(false);

  // 口令门：need=后端要求口令，authed=已通过。
  const [needPassword, setNeedPassword] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // 服务端是否启用了持久化（presets 跨设备共享）。null=未知，初始化时探测。
  const serverPersistRef = useRef<boolean>(false);
  const privatePersistRef = useRef(false);
  const privateStateScopeRef = useRef<PrivateStateScope>("none");
  const privateSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPrivateSaveRef = useRef<string>("");
  const privateStateRef = useRef<PrivateState>(emptyPrivateState());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 当前语言对应的默认输入文本；语言切换时若用户未自定义则跟随更新。
  const defaultInputRef = useRef(t("config.defaultInput"));

  const historyRef = useRef(history);
  historyRef.current = history;
  const statusEntriesRef = useRef(statusEntries);
  statusEntriesRef.current = statusEntries;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const customModelsPersistRef = useRef(customModelsPersist);
  customModelsPersistRef.current = customModelsPersist;

  // 当前连接/参数的 ref，供并发探测闭包读取最新值。
  const connRef = useRef(conn);
  connRef.current = conn;
  const configRef = useRef(config);
  configRef.current = config;

  const syncPrivateRef = (patch: Partial<PrivateState>) => {
    privateStateRef.current = {
      ...privateStateRef.current,
      ...patch,
      updatedAt: Date.now(),
    };
  };

  const savePrivateStateSnapshot = () => {
    if (!privatePersistRef.current) return;
    const scope = privateStateScopeRef.current;
    const state = privateStateForScope(privateStateRef.current, scope);
    const serialized = JSON.stringify(state);
    if (serialized === lastPrivateSaveRef.current) return;
    savePrivateState(state)
      .then((ok) => {
        if (!ok) {
          privatePersistRef.current = false;
          setStatusPersisted(false);
          showToast(t("app.privateStateUnavailable"));
        } else {
          lastPrivateSaveRef.current = serialized;
        }
      })
      .catch((e) => showToast(t("app.privateStateSaveFailed", { msg: e?.message ?? e })));
  };

  const schedulePrivateSave = () => {
    if (!privatePersistRef.current) return;
    if (privateSaveRef.current) clearTimeout(privateSaveRef.current);
    privateSaveRef.current = setTimeout(() => {
      privateSaveRef.current = null;
      savePrivateStateSnapshot();
    }, 7000);
  };

  const persistPrivateState = (patch: Partial<PrivateState>) => {
    syncPrivateRef(patch);
    schedulePrivateSave();
  };

  const persistPrivateStateNow = (patch: Partial<PrivateState>) => {
    syncPrivateRef(patch);
    if (privateSaveRef.current) {
      clearTimeout(privateSaveRef.current);
      privateSaveRef.current = null;
    }
    savePrivateStateSnapshot();
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1800);
  };

  const isLocalOrigin = () => {
    const host = window.location.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  };

  // 模型检测引擎（单行 4 协议探测 + 并发池）已抽到 useDetect；busy 由其持有。
  const { busy, progress, runBatch, cancelBatch } = useDetect({
    connRef,
    configRef,
    providers,
    setRows,
    historyRef,
    addHistoryEntry: (entry) => {
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_PRIVATE_HISTORY);
        historyRef.current = next;
        if (privateStateRef.current.historyPersist && privateStateScopeRef.current === "full") persistPrivateState({ history: next });
        return next;
      });
    },
    showToast,
  });

  // 应用主题（system 模式跟随系统切换）与语言（<html lang> + 标题）。
  useEffect(() => {
    initTheme();
    initLang();
  }, []);

  // 初始化：一次 bootstrap 请求完成口令验证、拉预设与恢复私有状态。
  const init = async () => {
    setLoadErr(null);
    try {
      const bootstrap = await fetchBootstrap();
      const health = bootstrap.health;
      const security = health.security;
      const scope = health.persistence?.privateState ? health.persistence.privateStateScope : "none";
      privateStateScopeRef.current = scope;
      setSecurityWarn(Boolean(security && !isLocalOrigin() && (!security.hasPassword || security.shouldWarnOpenProxy)));
      setNeedPassword(Boolean(health.needPassword));
      setAuthed(true);
      setPwError(null);
      // 预设来源优先级：服务端（跨设备共享）→ 本地缓存 → 静态默认。
      const serverPresets = bootstrap.settings;
      serverPersistRef.current = Boolean(health.persistence?.settings);
      // 静态默认兜底。
      const localPresets = loadLocalPresets();
      const activePresets = serverPresets ?? localPresets ?? await fetchPresets();
      const privateState = bootstrap.privateState;
      const privateCanPersist = privateState !== null;
      privatePersistRef.current = privateCanPersist;
      setStatusPersisted(privateCanPersist);
      const legacy = migrateLegacyPrivateState();
      const mergedPrivateState = mergePrivateState(privateState, legacy, scope);
      privateStateRef.current = mergedPrivateState;
      lastPrivateSaveRef.current = serializePrivateStateForScope(mergedPrivateState, scope);
      if (privateCanPersist && hasLegacyPrivateState(legacy)) {
        syncPrivateRef(mergedPrivateState);
        schedulePrivateSave();
      }
      // 服务端可用时，把结果回写本地作镜像缓存（离线/失败时仍可用）。
      if (serverPresets) saveLocalPresets(serverPresets);
      const { providers: provs, defaults: defs } = activePresets;
      setPresetDefaults(defs);
      setProviders(provs);
      setHistory(mergedPrivateState.history);
      setPersistState(mergedPrivateState.historyPersist);
      setCustomModelsPersist(mergedPrivateState.customModelsPersist);
      customModelsPersistRef.current = mergedPrivateState.customModelsPersist;
      setStatusEntries(mergedPrivateState.statusEntries);

      // 恢复参数配置
      const savedCfg = mergedPrivateState.config;
      const cfg: ConfigState = {
        input: savedCfg?.input ?? defaultInputRef.current,
        timeoutMs: savedCfg?.timeoutMs ?? defs.timeoutMs,
        maxRetries: savedCfg?.maxRetries ?? defs.maxRetries,
        maxTokens: savedCfg?.maxTokens ?? defs.maxTokens,
        userAgent: savedCfg?.userAgent ?? defs.userAgent ?? "",
        concurrency: normalizeConcurrency(savedCfg?.concurrency ?? defs.concurrency),
      };
      setConfig(cfg);

      // 恢复连接字段（含 key），但供应商始终默认「自定义」。
      const savedConn = mergedPrivateState.conn;
      setConn({
        providerId: CUSTOM_PROVIDER_ID,
        baseUrl: savedConn?.baseUrl ?? "",
        isFullUrl: Boolean(savedConn?.isFullUrl),
        apiKey: savedConn?.apiKey ?? "",
      });
      const initialRows = mergedPrivateState.customModelsPersist
        ? appendCustomModelRows(buildRows(provs, CUSTOM_PROVIDER_ID), mergedPrivateState.customModels)
        : buildRows(provs, CUSTOM_PROVIDER_ID);
      rowsRef.current = initialRows;
      setRows(initialRows);
      setAuthed(true);
    } catch (e: any) {
      if (isAuthError(e)) {
        setNeedPassword(true);
        setAuthed(false);
        setPwError(pwInput ? e?.message ?? t("app.pwInvalid") : null);
        setLoadErr(null);
        return;
      }
      setLoadErr(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    // 仅在挂载时初始化一次（init 引用每渲染都变，故有意省略依赖）。
    init();
    return () => {
      if (privateSaveRef.current) clearTimeout(privateSaveRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 语言切换时，若输入文本仍为默认值（用户未自定义）则跟随语言更新。
  useEffect(() => {
    const newDefault = t("config.defaultInput");
    setConfig((prev) => {
      if (prev.input === defaultInputRef.current && prev.input !== newDefault) {
        defaultInputRef.current = newDefault;
        return { ...prev, input: newDefault };
      }
      defaultInputRef.current = newDefault;
      return prev;
    });
    // t 的取值仅随 lang 变化，故依赖仅需 lang。
  }, [lang]);

  // 提交口令后重试初始化。
  const submitPassword = async () => {
    if (!pwInput) {
      setPwError(t("app.pwRequired"));
      return;
    }
    setPwError(null);
    setPwSubmitting(true);
    setAppPassword(pwInput);
    try {
      await init();
    } finally {
      setPwSubmitting(false);
    }
  };

  // 连接变更：切换供应商时调整模型勾选并重置探针；其余仅更新字段。持久化连接配置。
  const onConnChange = (v: ConnValue) => {
    const providerChanged = v.providerId !== conn.providerId;
    setConn(v);
    persistPrivateState({ conn: { providerId: v.providerId, baseUrl: v.baseUrl, isFullUrl: Boolean(v.isFullUrl), apiKey: v.apiKey } });
    if (providerChanged) setRows((rs) => selectRowsForProvider(rs, v.providerId));
  };

  const onConfigChange = (v: ConfigState) => {
    const nextConfig = { ...v, concurrency: normalizeConcurrency(v.concurrency) };
    setConfig(nextConfig);
    persistPrivateState({ config: nextConfig });
  };

  // 把 presets 持久化：服务端可用则写服务端（跨设备）；本地缓存始终作镜像同步。
  // 仅供应商设置/导入配置等显式 presets 操作会写服务端，普通测试参数走 private-state。
  const persistPresets = (presets: PresetsResponse) => {
    saveLocalPresets(presets);
    if (serverPersistRef.current) {
      saveSettings(presets)
        .then((ok) => { if (!ok) serverPersistRef.current = false; })
        .catch((e) => showToast(t("app.toastServerSaveFailed", { msg: e?.message ?? e })));
    }
  };

  const applyPresets = (presets: PresetsResponse, message: string) => {
    setPresetDefaults(presets.defaults);
    setProviders(presets.providers);
    persistPresets(presets);

    const currentConn = connRef.current;
    let nextConn = currentConn;
    if (currentConn.providerId !== CUSTOM_PROVIDER_ID) {
      const selected = presets.providers.find((p) => p.id === currentConn.providerId);
      nextConn = selected
        ? { ...currentConn, baseUrl: selected.baseUrl, isFullUrl: Boolean(selected.isFullUrl) }
        : { providerId: CUSTOM_PROVIDER_ID, baseUrl: "", isFullUrl: false, apiKey: currentConn.apiKey };
      setConn(nextConn);
      persistPrivateState({ conn: { providerId: nextConn.providerId, baseUrl: nextConn.baseUrl, isFullUrl: Boolean(nextConn.isFullUrl), apiKey: nextConn.apiKey } });
    }

    const nextRows = privateStateRef.current.customModelsPersist
      ? appendCustomModelRows(buildRows(presets.providers, nextConn.providerId), privateStateRef.current.customModels)
      : buildRows(presets.providers, nextConn.providerId);
    rowsRef.current = nextRows;
    setRows(nextRows);
    showToast(message);
  };

  const onPresetProvidersChange = (nextProviders: ProviderPreset[]) => {
    applyPresets({ providers: nextProviders, defaults: presetDefaults }, t("app.toastProvidersSaved"));
  };

  const onImportPresets = (presets: PresetsResponse) => {
    applyPresets(presets, t("app.toastImported"));
  };

  const onTogglePersist = (on: boolean) => {
    if (privateStateScopeRef.current !== "full") {
      setPersistState(false);
      showToast(t("app.privateStateUnavailable"));
      return;
    }
    setPersistState(on);
    if (!on) {
      setHistory([]);
      historyRef.current = [];
      persistPrivateState({ historyPersist: false, history: [] });
    } else {
      persistPrivateState({ historyPersist: true, history: historyRef.current });
    }
  };

  const onClearHistory = () => {
    setHistory([]);
    historyRef.current = [];
    persistPrivateState({ history: [] });
  };

  const onTestSelected = () => runBatch(rows.filter((r) => r.checked));

  const onToggle = (key: string, checked: boolean) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked } : r)));
  const onToggleAll = (checked: boolean) => setRows((rs) => rs.map((r) => ({ ...r, checked })));

  const updateRows = (updater: (current: ModelRow[]) => ModelRow[], persistCustomModels = false) => {
    const next = updater(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
    if (persistCustomModels && customModelsPersistRef.current) {
      persistPrivateStateNow({ customModels: customModelIds(next) });
    }
  };

  const onToggleCustomModelsPersist = (on: boolean) => {
    if (on && !privatePersistRef.current) {
      setCustomModelsPersist(false);
      customModelsPersistRef.current = false;
      showToast(t("app.privateStateUnavailable"));
      return;
    }
    setCustomModelsPersist(on);
    customModelsPersistRef.current = on;
    persistPrivateStateNow({
      customModelsPersist: on,
      customModels: on ? customModelIds(rowsRef.current) : [],
    });
  };

  const onAddModel = (model: string) => {
    updateRows((rs) => upsertCustomModelRows(rs, [model]), true);
  };
  const onRemoveModel = (key: string) => updateRows((rs) => rs.filter((r) => r.key !== key), true);

  const onAddToStatus = (drafts: StatusDraft[]) => {
    const clean = drafts.filter((entry) => entry.baseUrl.trim() && entry.apiKey.trim() && entry.model.trim());
    if (clean.length === 0) return;
    const byKey = new Map<string, StatusEntry>();
    for (const entry of statusEntriesRef.current) byKey.set(statusEntryKey(entry), entry);
    let changed = false;
    for (const draft of clean) {
      const key = statusEntryKey(draft);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, { ...existing, ...draft });
      } else {
        byKey.set(key, { ...draft, id: nextStatusId() });
      }
      changed = true;
    }
    if (!changed) return;
    const next = [...byKey.values()];
    statusEntriesRef.current = next;
    setStatusEntries(next);
    persistPrivateStateNow({ statusEntries: next });
    showToast(t("status.added", { count: clean.length }));
  };

  const onDeleteStatus = (ids: string[]) => {
    const idSet = new Set(ids);
    const next = statusEntriesRef.current.filter((entry) => !idSet.has(entry.id));
    statusEntriesRef.current = next;
    setStatusEntries(next);
    persistPrivateStateNow({ statusEntries: next });
    showToast(t("status.deleted", { count: ids.length }));
  };

  const onGotoStatusTest = (entry: StatusEntry) => {
    setActiveTab("test");
    onConnChange({
      providerId: CUSTOM_PROVIDER_ID,
      baseUrl: entry.baseUrl,
      isFullUrl: Boolean(entry.isFullUrl),
      apiKey: entry.apiKey,
    });
    onAddModel(entry.model);
  };

  // 批量加入模型（来自「拉取模型」弹层）：已存在则勾选，否则新增 custom 行。
  const onAddModels = (ids: string[]) => {
    updateRows((rs) => upsertCustomModelRows(rs, ids), true);
  };

  // 口令门：未通过时只显示口令输入。
  if (needPassword && !authed) {
    return (
      <div class="pw-gate">
        <h1>{t("app.pwTitle")}</h1>
        <section class="panel">
          <div class="field">
            <label>{t("app.pwLabel")}</label>
            <input
              type="password"
              value={pwInput}
              disabled={pwSubmitting}
              aria-invalid={Boolean(pwError)}
              onInput={(e) => {
                setPwInput((e.target as HTMLInputElement).value);
                if (pwError) setPwError(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !pwSubmitting) submitPassword(); }}
            />
            {pwError ? <div class="hint fail" role="alert">{pwError}</div> : null}
          </div>
          <div class="actions">
            <button class="primary" onClick={submitPassword} disabled={pwSubmitting}>
              {pwSubmitting ? t("app.pwChecking") : t("app.pwEnter")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div class="app">
      <header class="top">
        <h1>{t("app.title")}</h1>
        <span class="sub legend">
          <span class="pbadge success"><span class="pbadge-label">{t("app.legendProtocol")}</span></span>
          Chat·Resp·Gem·Claude
          <span class="legend-sep">·</span>
          <span class="sw green" />{t("app.legendPass")}<span class="sw red" />{t("app.legendFail")}<span class="sw blue" />{t("app.legendTesting")}
          <span class="legend-sep">·</span>
          <span class="stream-mark on">⚡</span>{t("app.legendStream")}<span class="stream-mark single">~</span>{t("app.legendSingle")}<span class="stream-mark off">⌁</span>{t("app.legendNone")}
        </span>
        <span class="spacer" />
        <LangToggle />
        <ThemeToggle />
      </header>

      <nav class="app-tabs" aria-label={t("app.navLabel")}>
        <button
          type="button"
          class={"app-tab " + (activeTab === "test" ? "active" : "")}
          aria-current={activeTab === "test" ? "page" : undefined}
          onClick={() => setActiveTab("test")}
        >
          {t("app.tabTest")}
        </button>
        <button
          type="button"
          class={"app-tab " + (activeTab === "settings" ? "active" : "")}
          aria-current={activeTab === "settings" ? "page" : undefined}
          onClick={() => setActiveTab("settings")}
        >
          {t("app.tabSettings")}
        </button>
        <button
          type="button"
          class={"app-tab " + (activeTab === "status" ? "active" : "")}
          aria-current={activeTab === "status" ? "page" : undefined}
          onClick={() => setActiveTab("status")}
        >
          {t("app.tabStatus")}
        </button>
      </nav>

      {loadErr ? (
        <section class="panel">
          <div class="status-text fail">{t("app.loadFailed", { msg: loadErr })}</div>
          <div class="actions"><button onClick={init}>{t("app.retry")}</button></div>
        </section>
      ) : null}

      {securityWarn ? (
        <section class="security-warning" role="status">
          <strong>{t("app.securityWarningTitle")}</strong>
          <span>{t("app.securityWarningBody")}</span>
        </section>
      ) : null}

      {activeTab === "test" ? (
        <>
          <ConnectionPanel providers={providers} value={conn} userAgent={config.userAgent} onChange={onConnChange} onAddModels={onAddModels} onToast={showToast} />
          <ModelTable
            rows={rows}
            busy={busy}
            progress={progress}
            conn={conn}
            userAgent={config.userAgent}
            providerName={
              providers.find((p) => p.id === conn.providerId)?.name ??
              (conn.providerId === CUSTOM_PROVIDER_ID ? t("common.custom") : conn.providerId)
            }
            onToggle={onToggle}
            onToggleAll={onToggleAll}
            customModelsPersist={customModelsPersist}
            customModelsPersistAvailable={statusPersisted}
            onToggleCustomModelsPersist={onToggleCustomModelsPersist}
            onAdd={onAddModel}
            onRemove={onRemoveModel}
            onTestSelected={onTestSelected}
            onCancel={cancelBatch}
            onAddToStatus={onAddToStatus}
            onLaunched={showToast}
          />
          <HistoryPanel
            entries={history}
            persist={persist}
            onTogglePersist={onTogglePersist}
            onClear={onClearHistory}
            onLaunched={showToast}
          />
        </>
      ) : activeTab === "status" ? (
        <StatusPanel
          entries={statusEntries}
          persisted={statusPersisted}
          onDelete={onDeleteStatus}
          onGotoTest={onGotoStatusTest}
          onLaunched={showToast}
        />
      ) : (
        <>
          <ConfigPanel value={config} onChange={onConfigChange} />
          <SettingsPanel
            providers={providers}
            defaults={presetDefaults}
            busy={busy}
            onChange={onPresetProvidersChange}
            onImport={onImportPresets}
          />
        </>
      )}

      {toast ? <div class="toast">{toast}</div> : null}
    </div>
  );
}
