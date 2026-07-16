import { useMemo, useRef, useState } from "preact/hooks";
import { Eye, EyeOff, ListPlus, Save, WalletCards } from "lucide-preact";
import type { Balance, ProviderPreset } from "../lib/types.js";
import { CUSTOM_PROVIDER_ID } from "../lib/presets.js";
import { fetchBalance, fetchModels } from "../lib/api.js";
import { sortByDisplayText } from "../lib/alphabetical-sort.js";
import { CopyButton } from "./CopyButton.js";
import { ModelPickerModal } from "./ModelPickerModal.js";
import { PromptModal } from "./PromptModal.js";
import { useI18n, translate, type Lang } from "../lib/i18n.js";

export interface ConnValue {
  providerId: string;
  baseUrl: string;
  isFullUrl?: boolean;
  apiKey: string;
}

export interface AddToProviderDraft {
  providerId?: string;
  name: string;
  id?: string;
  baseUrl: string;
  isFullUrl?: boolean;
  models: string[];
}

interface Props {
  providers: ProviderPreset[];
  value: ConnValue;
  userAgent?: string;
  selectedModels: string[];
  onChange: (v: ConnValue) => void;
  onAddModels: (ids: string[]) => void;
  onAddToProvider: (draft: AddToProviderDraft) => void;
  onToast: (msg: string, opts?: { tone?: "info" | "error"; ms?: number }) => void;
}

// 余额展示文案。
function fmtBalance(b: Balance, lang: Lang): string {
  const tr = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
  if (!b.supported) return tr("conn.balanceUnsupported");
  const unit = b.currency ? ` ${b.currency}` : "";
  if (b.remaining != null) {
    const extra = b.total != null && b.used != null ? tr("conn.balanceExtra", { total: b.total, used: b.used }) : "";
    const invalid = b.isValid === false ? tr("conn.balanceInvalid") : "";
    return tr("conn.balanceLine", { remaining: b.remaining, unit, extra, invalid });
  }
  return tr("conn.balanceNotParsed");
}

function looksLikeJsonObject(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith("{") && s.endsWith("}");
}

// 连接面板：点选供应商自动填 baseUrl；或选「自定义」自填。
// key 掩码显示，可切换明文，带复制按钮；并支持查询余额 / 拉取模型列表 / 添加到供应商。
export function ConnectionPanel({
  providers,
  value,
  userAgent,
  selectedModels,
  onChange,
  onAddModels,
  onAddToProvider,
  onToast,
}: Props) {
  const { t, lang } = useI18n();
  const [showKey, setShowKey] = useState(false);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceText, setBalanceText] = useState<string | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [pickerModels, setPickerModels] = useState<string[] | null>(null);
  const [providerPrompt, setProviderPrompt] = useState(false);
  const fetchModelsButtonRef = useRef<HTMLButtonElement>(null);

  const canLookup = Boolean(value.baseUrl && value.apiKey);
  const canAddProvider = Boolean(value.baseUrl.trim());
  const isCustom = value.providerId === CUSTOM_PROVIDER_ID;
  const selectedProvider = !isCustom ? providers.find((p) => p.id === value.providerId) : undefined;
  const sortedProviders = useMemo(
    () => sortByDisplayText(providers, (provider) => provider.name),
    [providers],
  );

  const onQueryBalance = async () => {
    if (!canLookup || balanceBusy) return;
    setBalanceBusy(true);
    setBalanceText(t("conn.querying"));
    try {
      const b = await fetchBalance({ baseUrl: value.baseUrl, isFullUrl: value.isFullUrl, apiKey: value.apiKey, userAgent });
      setBalanceText(fmtBalance(b, lang));
    } catch (e: any) {
      setBalanceText(t("conn.queryFailed", { msg: e?.message ?? e }));
    } finally {
      setBalanceBusy(false);
    }
  };

  const onFetchModels = async () => {
    if (!canLookup || modelsBusy) return;
    setModelsBusy(true);
    try {
      const { models } = await fetchModels({ baseUrl: value.baseUrl, isFullUrl: value.isFullUrl, apiKey: value.apiKey, userAgent });
      if (!models.length) {
        onToast(t("conn.noModelsFetched"));
        return;
      }
      setPickerModels(models);
    } catch (e: any) {
      onToast(t("conn.fetchModelsFailed", { msg: e?.message ?? e }), { tone: "error" });
    } finally {
      setModelsBusy(false);
    }
  };

  const closeModelPicker = () => {
    setPickerModels(null);
    requestAnimationFrame(() => fetchModelsButtonRef.current?.focus({ preventScroll: true }));
  };

  const onProvider = (id: string) => {
    if (id === CUSTOM_PROVIDER_ID) {
      onChange({ ...value, providerId: CUSTOM_PROVIDER_ID });
      return;
    }
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    // 切供应商：自动带出 baseUrl，保留已填 key。协议由自动检测决定，不在此设置。
    onChange({ providerId: id, baseUrl: p.baseUrl, isFullUrl: Boolean(p.isFullUrl), apiKey: value.apiKey });
  };

  const submitAddToProvider = () => {
    if (!canAddProvider) {
      onToast(t("conn.addToProviderNeedUrl"), { tone: "error" });
      return;
    }
    if (isCustom) {
      setProviderPrompt(true);
      return;
    }
    // 已有供应商：直接更新 baseUrl 并合并选中模型。
    onAddToProvider({
      providerId: value.providerId,
      name: selectedProvider?.name ?? value.providerId,
      baseUrl: value.baseUrl,
      isFullUrl: value.isFullUrl,
      models: selectedModels,
    });
  };

  const tryQuickImport = (raw: string, input: HTMLInputElement) => {
    const val = raw.trim();
    if (!val) return;
    // 仅在像完整 JSON 对象时反馈错误，避免边输入边刷 toast。
    if (!looksLikeJsonObject(val)) return;
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && parsed.key && parsed.url) {
        onChange({
          providerId: CUSTOM_PROVIDER_ID,
          baseUrl: String(parsed.url),
          apiKey: String(parsed.key),
          isFullUrl: Boolean(value.isFullUrl),
        });
        input.value = "";
        onToast(t("conn.quickImportSuccess"));
        return;
      }
      onToast(t("conn.quickImportInvalid"), { tone: "error" });
    } catch {
      onToast(t("conn.quickImportInvalid"), { tone: "error" });
    }
  };

  return (
    <section class="panel connection-panel">
      <div class="panel-title-row">
        <div>
          <span class="section-index">01</span>
          <h2>{t("conn.title")}</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          title={t("conn.addToProviderTitle")}
          aria-label={t("conn.addToProvider")}
          disabled={!canAddProvider}
          onClick={submitAddToProvider}
        >
          <Save size={16} aria-hidden="true" />
        </button>
      </div>

      <div class="field">
        <label for="connection-provider">{t("conn.provider")}</label>
        <select id="connection-provider" value={value.providerId} onChange={(e) => onProvider((e.target as HTMLSelectElement).value)}>
          <option value={CUSTOM_PROVIDER_ID}>{t("common.custom")}</option>
          {sortedProviders.map((p) => <option value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <details class="disclosure quick-import">
        <summary>{t("conn.quickImport")}</summary>
        <div class="disclosure-body">
          <label class="sr-only" for="connection-quick-import">{t("conn.quickImport")}</label>
          <input
            id="connection-quick-import"
            class="mono"
            type="text"
            placeholder={t("conn.quickImportPlaceholder")}
            onInput={(e) => tryQuickImport((e.target as HTMLInputElement).value, e.target as HTMLInputElement)}
          />
        </div>
      </details>

      <div class="row mt-12">
        <div class="field grow">
          <label for="connection-base-url">{t("conn.baseUrl")}</label>
          <div class="key-wrap">
            <input
              id="connection-base-url"
              class="mono"
              value={value.baseUrl}
              placeholder="https://api.example.com/v1"
              onInput={(e) => onChange({ ...value, baseUrl: (e.target as HTMLInputElement).value })}
            />
            <CopyButton value={value.baseUrl} title={t("conn.copyBaseUrl")} />
          </div>
          <div class="field-tools">
            <label class="toggle">
              <input
                type="checkbox"
                checked={Boolean(value.isFullUrl)}
                onChange={(e) => onChange({ ...value, isFullUrl: (e.target as HTMLInputElement).checked })}
              />
              {t("conn.fullUrl")}
            </label>
          </div>
        </div>
      </div>

      <div class="row mt-12">
        <div class="field grow">
          <label for="connection-api-key">API Key</label>
          <div class="key-wrap">
            <input
              id="connection-api-key"
              class="mono"
              type={showKey ? "text" : "password"}
              value={value.apiKey}
              placeholder={t("conn.apiKeyPlaceholder")}
              autocomplete="off"
              onInput={(e) => onChange({ ...value, apiKey: (e.target as HTMLInputElement).value })}
            />
            <button class="icon-button" aria-label={showKey ? t("conn.hide") : t("conn.show")} title={showKey ? t("conn.hide") : t("conn.show")} onClick={() => setShowKey((s) => !s)}>
              {showKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
            <CopyButton value={value.apiKey} title={t("conn.copyKey")} />
          </div>
          <div class="field-tools">
            <button
              class="compact-button"
              title={t("conn.b64Title")}
              onClick={(e) => {
                e.stopPropagation();
                try {
                  const decoded = new TextDecoder().decode(
                    Uint8Array.from(atob(value.apiKey), (c) => c.charCodeAt(0)),
                  );
                  onChange({ ...value, apiKey: decoded });
                } catch {
                  onToast(t("conn.decodeFailed"), { tone: "error" });
                }
              }}
            >
              B64
            </button>
            <button
              class="compact-button"
              title={t("conn.hexTitle")}
              onClick={(e) => {
                e.stopPropagation();
                try {
                  const bytes = value.apiKey
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((h) => {
                      if (!/^[0-9a-fA-F]{1,2}$/.test(h)) throw new Error("bad hex");
                      return parseInt(h, 16);
                    });
                  if (bytes.length === 0) {
                    onToast(t("conn.decodeFailed"), { tone: "error" });
                    return;
                  }
                  const decoded = new TextDecoder().decode(Uint8Array.from(bytes));
                  onChange({ ...value, apiKey: decoded });
                } catch {
                  onToast(t("conn.decodeFailed"), { tone: "error" });
                }
              }}
            >
              Hex
            </button>
            <button
              class="compact-button"
              title={t("conn.reverseTitle")}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ ...value, apiKey: Array.from(value.apiKey).reverse().join("") });
              }}
            >
              {t("conn.reverse")}
            </button>
            <span class="field-tools-sep" />
            <button
              class="compact-button"
              title={t("conn.queryBalanceTitle")}
              disabled={!canLookup || balanceBusy}
              onClick={(e) => { e.stopPropagation(); onQueryBalance(); }}
            >
              <WalletCards size={15} aria-hidden="true" />
              {t("conn.queryBalance")}
            </button>
            <button
              ref={fetchModelsButtonRef}
              class="compact-button secondary"
              title={t("conn.fetchModelsTitle")}
              disabled={!canLookup || modelsBusy}
              onClick={(e) => { e.stopPropagation(); onFetchModels(); }}
            >
              <ListPlus size={15} aria-hidden="true" />
              {modelsBusy ? t("conn.fetchingModels") : t("conn.fetchModels")}
            </button>
          </div>
          {balanceText ? <div class="balance-line">{balanceText}</div> : null}
        </div>
      </div>

      {pickerModels ? (
        <ModelPickerModal
          models={pickerModels}
          onConfirm={(ids) => { onAddModels(ids); onToast(t("conn.addedModels", { count: ids.length })); }}
          onClose={closeModelPicker}
        />
      ) : null}

      {providerPrompt ? (
        <PromptModal
          title={t("conn.addToProvider")}
          confirmLabel={t("conn.addToProviderConfirm")}
          fields={[
            {
              key: "name",
              label: t("conn.addToProviderName"),
              placeholder: t("conn.addToProviderNamePlaceholder"),
              required: true,
            },
            {
              key: "id",
              label: t("conn.addToProviderId"),
              placeholder: t("conn.addToProviderIdPlaceholder"),
              mono: true,
            },
          ]}
          onClose={() => setProviderPrompt(false)}
          onConfirm={({ name, id }) => {
            onAddToProvider({
              name,
              id: id || undefined,
              baseUrl: value.baseUrl,
              isFullUrl: value.isFullUrl,
              models: selectedModels,
            });
            setProviderPrompt(false);
          }}
        />
      ) : null}
    </section>
  );
}
