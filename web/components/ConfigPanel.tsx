import type { ConfigState } from "../lib/storage.js";

interface Props {
  value: ConfigState;
  onChange: (v: ConfigState) => void;
}

// 参数面板：输入文本、流式开关、超时、重试、maxTokens。缺省值由上层注入。
export function ConfigPanel({ value, onChange }: Props) {
  const numField = (key: keyof ConfigState, label: string, min: number, max: number, step = 1) => (
    <div class="field">
      <label>{label}</label>
      <input
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
    <section class="panel">
      <h2>参数</h2>
      <div class="config-grid">
        <div class="field full">
          <label>输入文本</label>
          <textarea
            rows={2}
            value={value.input}
            onInput={(e) => onChange({ ...value, input: (e.target as HTMLTextAreaElement).value })}
          />
        </div>
        {numField("timeoutMs", "超时 (ms)", 1000, 600000, 1000)}
        {numField("maxRetries", "最大重试", 0, 10)}
        {numField("maxTokens", "最大输出 token", 1, 200000)}
      </div>
    </section>
  );
}
