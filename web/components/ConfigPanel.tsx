import { useState } from "preact/hooks";
import type { ConfigState } from "../lib/types.js";
import { useI18n } from "../lib/i18n.js";
import { USER_AGENT_PRESETS, isValidUserAgentHeader } from "../lib/user-agent.js";
import { ChevronRight, SlidersHorizontal } from "lucide-preact";
import { useMediaQuery } from "./useMediaQuery.js";

export function ConfigPanel({ value, onChange }: { value: ConfigState; onChange: (v: ConfigState) => void }) {
  const { t } = useI18n();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [customUa, setCustomUa] = useState(false);
  const isPreset = USER_AGENT_PRESETS.some((preset) => preset.value === value.userAgent);
  const selectedUa = customUa || !isPreset ? "__custom__" : value.userAgent;
  const invalid = !isValidUserAgentHeader(value.userAgent);
  const numberField = (
    key: "concurrency" | "timeoutMs" | "maxTokens" | "maxRetries",
    label: string,
    min: number,
    max: number,
  ) => (
    <div class="field">
      <label for={`config-${key}`}>{label}</label>
      <input
        id={`config-${key}`}
        type="number"
        min={min}
        max={max}
        step="1"
        value={key === "timeoutMs" ? value.timeoutMs / 1000 : value[key]}
        onChange={(event) => {
          const n = Number(event.currentTarget.value);
          const next = Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
          onChange({ ...value, [key]: key === "timeoutMs" ? next * 1000 : next });
        }}
      />
    </div>
  );
  return (
    <details class="panel config-panel setup-disclosure" open={!mobile}>
      <summary class="setup-summary">
        <SlidersHorizontal size={20} aria-hidden="true" />
        <strong>{t("config.title")}</strong>
        <small>
          {t("ui.concurrencyShort")} {value.concurrency} · {value.timeoutMs / 1000}s · {value.maxTokens}
        </small>
        <ChevronRight size={16} class="config-edit" aria-hidden="true" />
      </summary>
      <div class="setup-body">
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
            onInput={(e) => onChange({ ...value, input: e.currentTarget.value })}
          />
        </div>
        <div class="field">
          <label for="config-user-agent">{t("config.userAgent")}</label>
          <select
            id="config-user-agent"
            value={selectedUa}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setCustomUa(next === "__custom__");
              if (next !== "__custom__") onChange({ ...value, userAgent: next });
            }}
          >
            {USER_AGENT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.labelKey)}
              </option>
            ))}
            <option value="__custom__">{t("config.userAgentCustomOption")}</option>
          </select>
        </div>
        {selectedUa === "__custom__" ? (
          <div class="field">
            <label for="config-custom-user-agent">{t("config.userAgentCustom")}</label>
            <input
              id="config-custom-user-agent"
              class="mono"
              value={value.userAgent}
              placeholder={t("config.userAgentPlaceholder")}
              aria-invalid={invalid}
              aria-describedby="config-user-agent-hint"
              onInput={(e) => onChange({ ...value, userAgent: e.currentTarget.value })}
            />
            <div id="config-user-agent-hint" class={"hint " + (invalid ? "fail" : "")}>
              {t(invalid ? "config.userAgentInvalid" : "config.userAgentHint")}
            </div>
          </div>
        ) : null}
        <div class="config-main-grid">
          {numberField("concurrency", t("ui.concurrencyShort"), 1, 10)}
          {numberField("timeoutMs", t("ui.timeoutSeconds"), 1, 600)}
          {numberField("maxTokens", t("ui.outputLimit"), 1, 200000)}
        </div>
        <details class="disclosure advanced-settings">
          <summary>
            <ChevronRight size={16} aria-hidden="true" />
            {t("config.advanced")}
          </summary>
          <div class="disclosure-body">{numberField("maxRetries", t("config.maxRetries"), 0, 10)}</div>
        </details>
      </div>
    </details>
  );
}
