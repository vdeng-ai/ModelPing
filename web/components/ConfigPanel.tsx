import type { ConfigState } from "../lib/types.js";
import { useI18n } from "../lib/i18n.js";
import { USER_AGENT_PRESETS, isValidUserAgentHeader } from "../lib/user-agent.js";
import { SlidersHorizontal } from "lucide-preact";

interface Props {
  value: ConfigState;
  onChange: (v: ConfigState) => void;
}

// 参数面板：输入文本、超时、重试、maxTokens、并发数。缺省值由上层注入。
export function ConfigPanel({ value, onChange }: Props) {
  const { t } = useI18n();
  const uaPresetValues = new Set<string>(USER_AGENT_PRESETS.map((p) => p.value));
  const selectedUserAgent = uaPresetValues.has(value.userAgent) ? value.userAgent : "__custom__";
  const userAgentInvalid = !isValidUserAgentHeader(value.userAgent);

  const numField = (key: keyof ConfigState, label: string, min: number, max: number, step = 1) => (
    <div class="field">
      <label for={`config-${key}`}>{label}</label>
      <input
        id={`config-${key}`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value[key] as number}
        onInput={(e) => {
          const n = Number((e.target as HTMLInputElement).value);
          onChange({ ...value, [key]: Number.isFinite(n) ? n : value[key] });
        }}
      />
    </div>
  );

  return (
    <section class="panel config-panel">
      <div class="panel-title-row">
        <div>
          <span class="section-index">02</span>
          <h2>{t("config.title")}</h2>
        </div>
        <SlidersHorizontal size={17} aria-hidden="true" />
      </div>

      <div class="field">
        <label for="config-input">{t("config.input")}</label>
        <textarea
          id="config-input"
          rows={3}
          value={value.input}
          onInput={(e) => onChange({ ...value, input: (e.target as HTMLTextAreaElement).value })}
        />
      </div>

      <div class="field">
        <label for="config-user-agent">{t("config.userAgent")}</label>
        <select
          id="config-user-agent"
          value={selectedUserAgent}
          onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value;
            if (next !== "__custom__") onChange({ ...value, userAgent: next });
          }}
        >
          {USER_AGENT_PRESETS.map((p) => <option value={p.value}>{t(p.labelKey)}</option>)}
          <option value="__custom__">{t("config.userAgentCustomOption")}</option>
        </select>
      </div>

      {selectedUserAgent === "__custom__" ? (
        <div class="field">
          <label for="config-custom-user-agent">{t("config.userAgentCustom")}</label>
          <input
            id="config-custom-user-agent"
            class={"mono " + (userAgentInvalid ? "invalid" : "")}
            value={value.userAgent}
            placeholder={t("config.userAgentPlaceholder")}
            aria-invalid={userAgentInvalid}
            aria-describedby="config-user-agent-hint"
            onInput={(e) => onChange({ ...value, userAgent: (e.target as HTMLInputElement).value })}
          />
          <div id="config-user-agent-hint" class={"hint " + (userAgentInvalid ? "fail" : "")}>
            {userAgentInvalid ? t("config.userAgentInvalid") : t("config.userAgentHint")}
          </div>
        </div>
      ) : null}

      <details class="disclosure advanced-settings">
        <summary>{t("config.advanced")}</summary>
        <div class="disclosure-body config-grid">
          {numField("timeoutMs", t("config.timeoutMs"), 1000, 600000, 1000)}
          {numField("maxRetries", t("config.maxRetries"), 0, 10)}
          {numField("maxTokens", t("config.maxTokens"), 1, 200000)}
          {numField("concurrency", t("config.concurrency"), 1, 10)}
        </div>
      </details>
    </section>
  );
}
