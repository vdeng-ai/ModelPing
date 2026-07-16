import { useEffect, useRef, useState } from "preact/hooks";
import { Activity, FlaskConical, History, ServerCog } from "lucide-preact";
import type { ConfigState, Defaults, HistoryEntry, PresetsResponse, PrivateState, ProviderPreset, StatusEntry } from "../lib/types.js";
import { emptyPrivateState, fetchBootstrap, fetchPresets, isAuthError, savePrivateState, saveSettings, setAppPassword } from "../lib/api.js";
import { MAX_PRIVATE_HISTORY } from "../../src/private-state.js";
import {
  CUSTOM_PROVIDER_ID,
  FALLBACK_DEFAULTS,
  normalizeConcurrency,
  normalizePresets,
  loadLocalPresets, saveLocalPresets,
} from "../lib/presets.js";
import { initTheme } from "../lib/theme.js";
import { ConnectionPanel, type ConnValue, type AddToProviderDraft } from "./ConnectionPanel.js";
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
import { appendCustomModelRows, buildRows, selectRowsForProvider, upsertCustomModelRows, type ModelRow } from "../lib/model-rows.js";
import {
  hasLegacyPrivateState,
  mergePrivateState,
  privateStateForScope,
  serializePrivateStateForScope,
  type PrivateStateScope,
} from "../lib/private-state-sync.js";
import { statusEntryKey } from "../lib/status-entries.js";
import { upsertProviderFromConn, upsertProviderModel } from "../lib/provider-upsert.js";
import { appRouteFromHash, hashForAppRoute, type AppRoute } from "../lib/navigation.js";

let statusSeq = 0;
const nextStatusId = () => `s${Date.now()}-${++statusSeq}`;

type StatusDraft = Omit<StatusEntry, "id">;

export function App() {
  const { t, lang } = useI18n();
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  const [presetDefaults, setPresetDefaults] = useState<Defaults>(FALLBACK_DEFAULTS);
  const [route, setRoute] = useState<AppRoute>(() => appRouteFromHash(window.location.hash));
  const [conn, setConn] = useState<ConnValue>({ providerId: CUSTOM_PROVIDER_ID, baseUrl: "", isFullUrl: false, apiKey: "" });
  const [config, setConfig] = useState<ConfigState>({ input: "", timeoutMs: 30000, maxRetries: 1, maxTokens: 512, userAgent: "", concurrency: 2 });
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [statusEntries, setStatusEntries] = useState<StatusEntry[]>([]);
  const [statusPersisted, setStatusPersisted] = useState(true);
  const [savedCustomModels, setSavedCustomModels] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"info" | "error" | "success">("info");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
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
  const mainRef = useRef<HTMLElement | null>(null);
  // 当前语言对应的默认输入文本；语言切换时若用户未自定义则跟随更新。
  const defaultInputRef = useRef(t("config.defaultInput"));

  const navigateTo = (next: AppRoute) => {
    const hash = hashForAppRoute(next);
    if (window.location.hash === hash) {
      setRoute(next);
      return;
    }
    window.location.hash = hash;
  };

  const historyRef = useRef(history);
  historyRef.current = history;
  const statusEntriesRef = useRef(statusEntries);
  statusEntriesRef.current = statusEntries;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const savedCustomModelsRef = useRef(savedCustomModels);
  savedCustomModelsRef.current = savedCustomModels;
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const presetDefaultsRef = useRef(presetDefaults);
  presetDefaultsRef.current = presetDefaults;

  // 当前连接/参数的 ref，供并发探测闭包读取最新值。
  const connRef = useRef(conn);
  connRef.current = conn;
  const configRef = useRef(config);
  configRef.current = config;

  const syncPrivateRef = (patch: Partial<PrivateState>) => {
    privateStateRef.current = {
      ...privateStateRef.current,
      ...patch,
      // History is session-only and never written to private-state.
      historyPersist: false,
      history: [],
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
      .catch((e) => showToast(t("app.privateStateSaveFailed", { msg: e?.message ?? e }), { tone: "error" }));
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

  const showToast = (msg: string, opts?: { ms?: number; tone?: "info" | "error" | "success" }) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const tone = opts?.tone ?? "info";
    setToastTone(tone);
    setToast(msg);
    const ms = opts?.ms ?? (tone === "error" ? 3600 : 1800);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, ms);
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
      // Session-only: never write history into private-state.
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_PRIVATE_HISTORY);
        historyRef.current = next;
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

  // Top-level views use hash navigation so browser back/forward and deep links
  // remain local to the SPA and never add Worker requests.
  useEffect(() => {
    const syncRoute = () => {
      const next = appRouteFromHash(window.location.hash);
      setRoute(next);
      const canonical = hashForAppRoute(next);
      if (window.location.hash !== canonical) {
        window.history.replaceState(null, "", canonical);
      }
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [route]);

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
      // Always keep history empty in the synced snapshot.
      privateStateRef.current = { ...mergedPrivateState, historyPersist: false, history: [] };
      lastPrivateSaveRef.current = serializePrivateStateForScope(privateStateRef.current, scope);
      if (privateCanPersist && hasLegacyPrivateState(legacy)) {
        // Migrate legacy conn/config (history intentionally dropped).
        schedulePrivateSave();
      }
      // 服务端可用时，把结果回写本地作镜像缓存（离线/失败时仍可用）。
      if (serverPresets) saveLocalPresets(serverPresets);
      const { providers: provs, defaults: defs } = activePresets;
      setPresetDefaults(defs);
      setProviders(provs);
      // History is session-only — never restore from server/legacy.
      setHistory([]);
      historyRef.current = [];
      const customModels = mergedPrivateState.customModels;
      setSavedCustomModels(customModels);
      savedCustomModelsRef.current = customModels;
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
      // Always rehydrate saved custom models (no checkbox gate).
      const initialRows = appendCustomModelRows(buildRows(provs, CUSTOM_PROVIDER_ID), customModels);
      rowsRef.current = initialRows;
      setRows(initialRows);
      setAuthed(true);
      setBootstrapped(true);
    } catch (e: any) {
      if (isAuthError(e)) {
        setNeedPassword(true);
        setAuthed(false);
        setPwError(pwInput ? e?.message ?? t("app.pwInvalid") : null);
        setLoadErr(null);
        return;
      }
      setLoadErr(e?.message ?? String(e));
      setBootstrapped(true);
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
        .catch((e) => showToast(t("app.toastServerSaveFailed", { msg: e?.message ?? e }), { tone: "error" }));
    }
  };

  const applyPresets = (presets: PresetsResponse, message: string, options?: { switchToProviderId?: string }) => {
    setPresetDefaults(presets.defaults);
    setProviders(presets.providers);
    providersRef.current = presets.providers;
    presetDefaultsRef.current = presets.defaults;
    persistPresets(presets);

    const currentConn = connRef.current;
    let nextConn = currentConn;
    if (options?.switchToProviderId) {
      const selected = presets.providers.find((p) => p.id === options.switchToProviderId);
      if (selected) {
        nextConn = {
          providerId: selected.id,
          baseUrl: selected.baseUrl,
          isFullUrl: Boolean(selected.isFullUrl),
          apiKey: currentConn.apiKey,
        };
        setConn(nextConn);
        persistPrivateState({ conn: { providerId: nextConn.providerId, baseUrl: nextConn.baseUrl, isFullUrl: Boolean(nextConn.isFullUrl), apiKey: nextConn.apiKey } });
      }
    } else if (currentConn.providerId !== CUSTOM_PROVIDER_ID) {
      const selected = presets.providers.find((p) => p.id === currentConn.providerId);
      nextConn = selected
        ? { ...currentConn, baseUrl: selected.baseUrl, isFullUrl: Boolean(selected.isFullUrl) }
        : { providerId: CUSTOM_PROVIDER_ID, baseUrl: "", isFullUrl: false, apiKey: currentConn.apiKey };
      setConn(nextConn);
      persistPrivateState({ conn: { providerId: nextConn.providerId, baseUrl: nextConn.baseUrl, isFullUrl: Boolean(nextConn.isFullUrl), apiKey: nextConn.apiKey } });
    }

    const nextRows = appendCustomModelRows(
      buildRows(presets.providers, nextConn.providerId),
      savedCustomModelsRef.current,
    );
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

  const onAddToProvider = (draft: AddToProviderDraft) => {
    try {
      const { providers: nextProviders, providerId } = upsertProviderFromConn(providersRef.current, draft);
      const normalized = normalizePresets({ providers: nextProviders, defaults: presetDefaultsRef.current });
      const created = !draft.providerId || draft.providerId === CUSTOM_PROVIDER_ID
        || !providersRef.current.some((p) => p.id === draft.providerId);
      const name = normalized.providers.find((p) => p.id === providerId)?.name ?? draft.name;
      applyPresets(
        normalized,
        created ? t("conn.addToProviderCreated", { name }) : t("conn.addToProviderUpdated", { name }),
        created ? { switchToProviderId: providerId } : undefined,
      );
    } catch (e: any) {
      showToast(t("conn.addToProviderFailed", { msg: e?.message ?? e }), { tone: "error" });
    }
  };

  const onClearHistory = () => {
    setHistory([]);
    historyRef.current = [];
  };

  const onTestSelected = () => runBatch(rows.filter((r) => r.checked));

  const onToggle = (key: string, checked: boolean) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked } : r)));
  const onToggleAll = (checked: boolean) => setRows((rs) => rs.map((r) => ({ ...r, checked })));

  const updateRows = (updater: (current: ModelRow[]) => ModelRow[]) => {
    const next = updater(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
  };

  const onSaveCustomModel = (model: string) => {
    const id = model.trim();
    if (!id) return;
    if (!privatePersistRef.current) {
      showToast(t("app.privateStateUnavailable"));
      return;
    }
    const nextSaved = savedCustomModelsRef.current.includes(id)
      ? savedCustomModelsRef.current
      : [...savedCustomModelsRef.current, id];
    savedCustomModelsRef.current = nextSaved;
    setSavedCustomModels(nextSaved);
    persistPrivateStateNow({
      customModels: nextSaved,
      customModelsPersist: nextSaved.length > 0,
    });

    // Also upsert into current named provider presets when not custom.
    const providerId = connRef.current.providerId;
    if (providerId !== CUSTOM_PROVIDER_ID) {
      try {
        const nextProviders = upsertProviderModel(providersRef.current, providerId, id);
        const normalized = normalizePresets({ providers: nextProviders, defaults: presetDefaultsRef.current });
        setProviders(normalized.providers);
        providersRef.current = normalized.providers;
        persistPresets(normalized);
      } catch (e: any) {
        showToast(t("conn.addToProviderFailed", { msg: e?.message ?? e }), { tone: "error" });
      }
    }
    showToast(t("models.modelSaved", { model: id }));
  };

  const onAddModel = (model: string) => {
    updateRows((rs) => upsertCustomModelRows(rs, [model]));
  };

  const onRemoveModel = (key: string) => {
    const target = rowsRef.current.find((r) => r.key === key);
    updateRows((rs) => rs.filter((r) => r.key !== key));
    if (target?.custom) {
      const id = target.label.trim();
      if (id && savedCustomModelsRef.current.includes(id)) {
        const nextSaved = savedCustomModelsRef.current.filter((m) => m !== id);
        savedCustomModelsRef.current = nextSaved;
        setSavedCustomModels(nextSaved);
        persistPrivateStateNow({
          customModels: nextSaved,
          customModelsPersist: nextSaved.length > 0,
        });
      }
    }
  };

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
    navigateTo("test-models");
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
    updateRows((rs) => upsertCustomModelRows(rs, ids));
  };

  const selectedModelIds = rows
    .filter((r) => r.checked)
    .map((r) => (r.custom ? r.label : (r.modelByProvider[conn.providerId] ?? r.label)))
    .filter(Boolean);

  // 口令门：未通过时只显示口令输入。
  if (needPassword && !authed) {
    return (
      <div class="pw-gate">
        <span class="pw-gate-logo" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pw-ping" x1="11" y1="8" x2="53" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="var(--brand-from)" />
                <stop offset="1" stop-color="var(--brand-to)" />
              </linearGradient>
            </defs>
            <path d="M14.5 40C18 47 24.4 51.5 32 51.5S46 47 49.5 40" fill="none" stroke="url(#pw-ping)" stroke-width="6.5" stroke-linecap="round" />
            <circle cx="32" cy="30" r="16" fill="none" stroke="url(#pw-ping)" stroke-width="3" />
            <circle cx="32" cy="23.5" r="4" fill="var(--brand-to)" />
            <circle cx="25.5" cy="34.5" r="4" fill="var(--brand-from)" />
            <circle cx="39" cy="34.5" r="4" fill="var(--brand-from)" />
          </svg>
        </span>
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

  const testRoute = route === "test-models" || route === "test-history";

  return (
    <div class="app-shell">
      <a class="skip-link" href="#main-content">{t("app.skipToContent")}</a>
      <header class="app-header">
        <div class="app-header-inner">
          <div class="brand-lockup">
            <span class="brand-logo" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="brand-ping" x1="11" y1="8" x2="53" y2="56" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="var(--brand-from)" />
                    <stop offset="1" stop-color="var(--brand-to)" />
                  </linearGradient>
                </defs>
                <path d="M14.5 40C18 47 24.4 51.5 32 51.5S46 47 49.5 40" fill="none" stroke="url(#brand-ping)" stroke-width="6.5" stroke-linecap="round" />
                <circle cx="32" cy="30" r="16" fill="none" stroke="url(#brand-ping)" stroke-width="3" />
                <circle cx="32" cy="23.5" r="4" fill="var(--brand-to)" />
                <circle cx="25.5" cy="34.5" r="4" fill="var(--brand-from)" />
                <circle cx="39" cy="34.5" r="4" fill="var(--brand-from)" />
              </svg>
            </span>
            <span class="brand-copy">
              <strong>ModelPing</strong>
              <span>{t("app.title")}</span>
            </span>
          </div>

          <nav class="primary-nav" aria-label={t("app.navLabel")}>
            <button
              type="button"
              class={"nav-item " + (testRoute ? "active" : "")}
              aria-current={testRoute ? "page" : undefined}
              onClick={() => navigateTo("test-models")}
            >
              <FlaskConical size={17} aria-hidden="true" />
              {t("app.tabTest")}
            </button>
            <button
              type="button"
              class={"nav-item " + (route === "status" ? "active" : "")}
              aria-current={route === "status" ? "page" : undefined}
              onClick={() => navigateTo("status")}
            >
              <Activity size={17} aria-hidden="true" />
              {t("app.tabStatus")}
              {statusEntries.length ? <span class="nav-count">{statusEntries.length}</span> : null}
            </button>
            <button
              type="button"
              class={"nav-item " + (route === "providers" ? "active" : "")}
              aria-current={route === "providers" ? "page" : undefined}
              onClick={() => navigateTo("providers")}
            >
              <ServerCog size={17} aria-hidden="true" />
              {t("app.tabProviders")}
            </button>
          </nav>

          <div class="app-utilities">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" class="app-main" ref={mainRef} tabIndex={-1}>
        {loadErr ? (
          <section class="panel">
            <div class="status-text fail">{t("app.loadFailed", { msg: loadErr })}</div>
            <div class="actions"><button onClick={init}>{t("app.retry")}</button></div>
          </section>
        ) : null}

        {!loadErr && !bootstrapped ? (
          <section class="panel" aria-busy="true" aria-label={t("app.loading")}>
            <div class="skeleton-stack">
              <div class="skeleton-bar" />
              <div class="skeleton-bar short" />
              <div class="skeleton-bar" />
            </div>
          </section>
        ) : null}

        {securityWarn ? (
          <section class="security-warning" role="status">
            <strong>{t("app.securityWarningTitle")}</strong>
            <span>{t("app.securityWarningBody")}</span>
          </section>
        ) : null}

        {!loadErr && bootstrapped && testRoute ? (
          <div class="test-workspace">
            <aside class="workspace-sidebar" aria-label={t("app.setupLabel")}>
              <ConnectionPanel
                providers={providers}
                value={conn}
                userAgent={config.userAgent}
                selectedModels={selectedModelIds}
                onChange={onConnChange}
                onAddModels={onAddModels}
                onAddToProvider={onAddToProvider}
                onToast={showToast}
              />
              <ConfigPanel value={config} onChange={onConfigChange} />
            </aside>
            <section class="workspace-content" aria-label={t("app.workspaceLabel")}>
              <div class="workspace-tabs" role="tablist" aria-label={t("app.workspaceLabel")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={route === "test-models"}
                  class={route === "test-models" ? "active" : ""}
                  onClick={() => navigateTo("test-models")}
                >
                  <FlaskConical size={16} aria-hidden="true" />
                  {t("app.workspaceModels")}
                  <span class="tab-count">{rows.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={route === "test-history"}
                  class={route === "test-history" ? "active" : ""}
                  onClick={() => navigateTo("test-history")}
                >
                  <History size={16} aria-hidden="true" />
                  {t("app.workspaceHistory")}
                  <span class="tab-count">{history.length}</span>
                </button>
              </div>
              {route === "test-models" ? (
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
                  savedCustomModels={savedCustomModels}
                  privatePersistAvailable={statusPersisted}
                  onToggle={onToggle}
                  onToggleAll={onToggleAll}
                  onAdd={onAddModel}
                  onRemove={onRemoveModel}
                  onSaveCustomModel={onSaveCustomModel}
                  onTestSelected={onTestSelected}
                  onCancel={cancelBatch}
                  onAddToStatus={onAddToStatus}
                  onLaunched={showToast}
                />
              ) : (
                <HistoryPanel entries={history} onClear={onClearHistory} onLaunched={showToast} />
              )}
            </section>
          </div>
        ) : !loadErr && bootstrapped && route === "status" ? (
          <StatusPanel
            entries={statusEntries}
            persisted={statusPersisted}
            onDelete={onDeleteStatus}
            onGotoTest={onGotoStatusTest}
            onLaunched={showToast}
          />
        ) : !loadErr && bootstrapped ? (
          <SettingsPanel
            providers={providers}
            defaults={presetDefaults}
            busy={busy}
            onChange={onPresetProvidersChange}
            onImport={onImportPresets}
          />
        ) : null}

        {toast ? <div class={"toast" + (toastTone === "error" ? " error" : "") + (toastTone === "success" ? " success" : "")} role="status" aria-live="polite">{toast}</div> : null}
      </main>
    </div>
  );
}
