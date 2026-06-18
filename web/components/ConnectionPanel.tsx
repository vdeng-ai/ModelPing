import { useState } from "preact/hooks";
import type { Balance, ProviderPreset } from "../lib/types.js";
import { CUSTOM_PROVIDER_ID } from "../lib/presets.js";
import { fetchBalance, fetchModels } from "../lib/api.js";
import { CopyButton } from "./CopyButton.js";
import { ModelPickerModal } from "./ModelPickerModal.js";

export interface ConnValue {
  providerId: string;
  baseUrl: string;
  isFullUrl?: boolean;
  apiKey: string;
}

interface Props {
  providers: ProviderPreset[];
  value: ConnValue;
  onChange: (v: ConnValue) => void;
  onAddModels: (ids: string[]) => void;
  onToast: (msg: string) => void;
}

// 余额展示文案。
function fmtBalance(b: Balance): string {
  if (!b.supported) return "该供应商不支持余额查询";
  const unit = b.currency ? ` ${b.currency}` : "";
  if (b.remaining != null) {
    const extra = b.total != null && b.used != null ? `（总 ${b.total} / 已用 ${b.used}）` : "";
    const invalid = b.isValid === false ? "（账户不可用）" : "";
    return `余额 ${b.remaining}${unit}${extra}${invalid}`;
  }
  return "未解析到余额";
}

// 连接面板：点选供应商自动填 baseUrl；或选「自定义」自填。
// key 掩码显示，可切换明文，带复制按钮；并支持查询余额 / 拉取模型列表。
export function ConnectionPanel({ providers, value, onChange, onAddModels, onToast }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceText, setBalanceText] = useState<string | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [pickerModels, setPickerModels] = useState<string[] | null>(null);

  const canLookup = Boolean(value.baseUrl && value.apiKey);

  const onQueryBalance = async () => {
    if (!canLookup || balanceBusy) return;
    setBalanceBusy(true);
    setBalanceText("查询中…");
    try {
      const b = await fetchBalance({ baseUrl: value.baseUrl, isFullUrl: value.isFullUrl, apiKey: value.apiKey });
      setBalanceText(fmtBalance(b));
    } catch (e: any) {
      setBalanceText(`查询失败：${e?.message ?? e}`);
    } finally {
      setBalanceBusy(false);
    }
  };

  const onFetchModels = async () => {
    if (!canLookup || modelsBusy) return;
    setModelsBusy(true);
    try {
      const { models } = await fetchModels({ baseUrl: value.baseUrl, isFullUrl: value.isFullUrl, apiKey: value.apiKey });
      if (!models.length) {
        onToast("未拉取到模型");
        return;
      }
      setPickerModels(models);
    } catch (e: any) {
      onToast(`拉取模型失败：${e?.message ?? e}`);
    } finally {
      setModelsBusy(false);
    }
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

  return (
    <section class="panel">
      <h2>连接</h2>
      <div class="field">
        <label>供应商</label>
        <div class="provider-grid">
          <button
            type="button"
            class={"provider-card " + (value.providerId === CUSTOM_PROVIDER_ID ? "active" : "")}
            onClick={() => onProvider(CUSTOM_PROVIDER_ID)}
          >
            自定义
          </button>
          {providers.map((p) => (
            <button
              type="button"
              class={"provider-card " + (value.providerId === p.id ? "active" : "")}
              onClick={() => onProvider(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <div class="field grow">
          <label>Base URL</label>
          <div class="key-wrap">
            <input
              class="mono"
              value={value.baseUrl}
              placeholder="https://api.example.com/v1"
              onInput={(e) => onChange({ ...value, baseUrl: (e.target as HTMLInputElement).value })}
            />
            <CopyButton value={value.baseUrl} title="复制 Base URL" />
          </div>
          <div class="field-tools">
            <label class="toggle">
              <input
                type="checkbox"
                checked={Boolean(value.isFullUrl)}
                onChange={(e) => onChange({ ...value, isFullUrl: (e.target as HTMLInputElement).checked })}
              />
              完整 URL
            </label>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <div class="field grow">
          <label>API Key</label>
          <div class="key-wrap">
            <input
              class="mono"
              type={showKey ? "text" : "password"}
              value={value.apiKey}
              placeholder="粘贴你的 API Key"
              autocomplete="off"
              onInput={(e) => onChange({ ...value, apiKey: (e.target as HTMLInputElement).value })}
            />
            <button class="icon" title={showKey ? "隐藏" : "显示"} onClick={() => setShowKey((s) => !s)}>
              {showKey ? "隐藏" : "显示"}
            </button>
            <CopyButton value={value.apiKey} title="复制 Key" />
          </div>
          <div class="field-tools">
            <button
              class="icon"
              title="Base64 解码"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  const decoded = new TextDecoder().decode(
                    Uint8Array.from(atob(value.apiKey), (c) => c.charCodeAt(0)),
                  );
                  onChange({ ...value, apiKey: decoded });
                } catch {
                  // 非法 base64 或空值:静默不改
                }
              }}
            >
              B64
            </button>
            <button
              class="icon"
              title="Hex 解码(空格分隔的十六进制 → 明文)"
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
                  if (bytes.length === 0) return;
                  const decoded = new TextDecoder().decode(Uint8Array.from(bytes));
                  onChange({ ...value, apiKey: decoded });
                } catch {
                  // 非法 hex:静默不改
                }
              }}
            >
              Hex
            </button>
            <button
              class="icon"
              title="字符串倒序"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ ...value, apiKey: Array.from(value.apiKey).reverse().join("") });
              }}
            >
              倒序
            </button>
            <span class="field-tools-sep" />
            <button
              class="icon"
              title="查询该供应商余额（按 baseUrl 主机识别）"
              disabled={!canLookup || balanceBusy}
              onClick={(e) => { e.stopPropagation(); onQueryBalance(); }}
            >
              查询余额
            </button>
            <button
              class="icon"
              title="拉取该供应商可用模型列表"
              disabled={!canLookup || modelsBusy}
              onClick={(e) => { e.stopPropagation(); onFetchModels(); }}
            >
              {modelsBusy ? "拉取中…" : "拉取模型"}
            </button>
          </div>
          {balanceText ? <div class="balance-line">{balanceText}</div> : null}
        </div>
      </div>

      {pickerModels ? (
        <ModelPickerModal
          models={pickerModels}
          onConfirm={(ids) => { onAddModels(ids); onToast(`已添加 ${ids.length} 个模型`); }}
          onClose={() => setPickerModels(null)}
        />
      ) : null}
    </section>
  );
}
