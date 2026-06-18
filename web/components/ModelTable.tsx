import { useState } from "preact/hooks";
import type { Protocol, StreamVerdict, TestResult } from "../lib/types.js";
import { fmtMs, fmtTok, PROTOCOL_LABEL, streamGlyph } from "../lib/format.js";
import { CcSwitchButton } from "./CcSwitchButton.js";

export const PROTOCOLS: Protocol[] = ["openai-chat", "openai-responses", "gemini", "anthropic"];

// 按模型名挑选需要测试的协议族：已知厂商只测其原生协议，其余（含 gpt 与未知）默认走 OpenAI 两套。
// 用 label + 实际请求 id 拼接后匹配，避免某一项不含关键字时漏判。
export function protocolsForModel(name: string): Protocol[] {
  const n = name.toLowerCase();
  if (n.includes("claude")) return ["anthropic"];
  if (n.includes("gemini")) return ["gemini"];
  return ["openai-chat", "openai-responses"];
}

// 单个「模型 × 协议」探测的运行时状态。
export interface ProtocolProbe {
  protocol: Protocol;
  status: "idle" | "skipped" | "testing" | "success" | "fail";
  result: TestResult | null;        // 非流式结果（延迟/token/error）
  streamVerdict: StreamVerdict;     // 流式探测结论（null=未探测）
  streamTtftMs: number | null;
}

// 一行模型：聚合 4 个协议的探测结果。App 持有并维护。
export interface ModelRow {
  key: string;          // 唯一行 id
  label: string;        // 官方原始模型名
  modelByProvider: Record<string, string>; // 供应商 id -> 实际请求 model id
  custom: boolean;      // 是否用户自定义添加
  checked: boolean;
  probes: Record<Protocol, ProtocolProbe>;
}

// 生成 4 个 idle 探针。
export function freshProbes(): Record<Protocol, ProtocolProbe> {
  const out = {} as Record<Protocol, ProtocolProbe>;
  for (const p of PROTOCOLS) {
    out[p] = { protocol: p, status: "idle", result: null, streamVerdict: null, streamTtftMs: null };
  }
  return out;
}

interface Props {
  rows: ModelRow[];
  busy: boolean;
  conn: { baseUrl: string; apiKey: string };
  providerName: string;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onAdd: (model: string) => void;
  onRemove: (key: string) => void;
  onTestSelected: () => void;
  onTestAll: () => void;
  onLaunched: (msg: string) => void;
}

// 协议徽章：带协议简称的状态药丸（绿通过 / 红失败 / 蓝测试中 / 中性待测），
// 流式结论以内嵌图标显示（⚡真流式 / ~伪流式 / ⌁无流），完整文案在 tooltip。
function streamText(verdict: ProtocolProbe["streamVerdict"], ttftMs: number | null): string {
  switch (verdict) {
    case "stream":
      return `，流式支持${ttftMs != null ? `，首字 ${fmtMs(ttftMs)}` : ""}`;
    case "single":
      return "，流式一次性返回（非真流式）";
    case "none":
      return "，不支持流式";
    default:
      return "";
  }
}

function Badge({ probe }: { probe: ProtocolProbe }) {
  const { protocol, status, result, streamVerdict, streamTtftMs } = probe;
  const title =
    status === "fail" && result?.error ? `${protocol}: ${result.error}`
    : status === "success" ? `${protocol}: 延迟 ${fmtMs(result?.latencyMs ?? null)}${streamText(streamVerdict, streamTtftMs)}`
    : status === "testing" ? `${protocol}: 测试中...`
    : status === "skipped" ? `${protocol}: 不适用（按模型族跳过）`
    : `${protocol}: 待测`;
  const g = streamGlyph(streamVerdict);
  return (
    <span class={"pbadge " + status} title={title} aria-label={title}>
      <span class="pbadge-label">{PROTOCOL_LABEL[protocol]}</span>
      {g ? <span class={"stream-mark " + g.cls}>{g.char}</span> : null}
    </span>
  );
}

// 该模型卡要显示哪些协议徽章：测试前只显示计划要测的协议，测试中/后显示实际跑的，隐藏跳过的。
function shownProtocols(r: ModelRow): Protocol[] {
  return PROTOCOLS.filter((p) => {
    const s = r.probes[p].status;
    if (s === "skipped") return false;
    if (s === "idle") return protocolsForModel(r.label).includes(p);
    return true; // testing / success / fail
  });
}

export function ModelTable(props: Props) {
  const { rows, busy, conn, providerName } = props;
  const [newModel, setNewModel] = useState("");

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked);

  // 取该行第一个成功协议的输出文本作预览。
  const previewText = (r: ModelRow): string => {
    for (const p of PROTOCOLS) {
      const pr = r.probes[p];
      if (pr.status === "success" && pr.result?.text) return pr.result.text;
    }
    return "";
  };
  // 取该行第一个成功协议的 usage 作展示。
  const firstSuccess = (r: ModelRow): TestResult | null => {
    for (const p of PROTOCOLS) {
      const pr = r.probes[p];
      if (pr.status === "success" && pr.result) return pr.result;
    }
    return null;
  };
  const statusText = (r: ModelRow): string => {
    const testing = PROTOCOLS.filter((p) => r.probes[p].status === "testing").length;
    if (testing) return "测试中";
    const success = PROTOCOLS.filter((p) => r.probes[p].status === "success").length;
    if (success) return `${success} 通过`;
    const fail = PROTOCOLS.filter((p) => r.probes[p].status === "fail").length;
    if (fail) return "未通过";
    return "待测";
  };

  const add = () => {
    if (!newModel.trim()) return;
    props.onAdd(newModel.trim());
    setNewModel("");
  };

  return (
    <section class="panel">
      <h2>模型</h2>

      <div class="actions" style="margin-bottom:12px">
        <button class="primary" disabled={busy || !someChecked} onClick={props.onTestSelected}>
          测试选中
        </button>
        <button disabled={busy || rows.length === 0} onClick={() => props.onToggleAll(!allChecked)}>
          {allChecked ? "取消全选" : "全选"}
        </button>
        <CcSwitchButton
          name={providerName}
          endpoint={conn.baseUrl}
          apiKey={conn.apiKey}
          defaultApp="claude"
          disabled={busy || !conn.baseUrl || !conn.apiKey}
          onLaunched={props.onLaunched}
        />
      </div>

      {rows.length === 0 ? (
        <div class="empty">暂无模型。下方可添加自定义模型。</div>
      ) : (
        <div class="model-card-grid">
          {rows.map((r) => {
            const fs = firstSuccess(r);
            const preview = previewText(r);
            return (
              <button
                key={r.key}
                type="button"
                class={"provider-card model-card " + (r.checked ? "active" : "")}
                disabled={busy}
                onClick={() => props.onToggle(r.key, !r.checked)}
              >
                <span class="model-card-head">
                  <span class="model-name">{r.label}</span>
                  {r.custom ? (
                    <span
                      class="model-remove"
                      role="button"
                      tabIndex={0}
                      title="移除"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onRemove(r.key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          props.onRemove(r.key);
                        }
                      }}
                    >
                      x
                    </span>
                  ) : null}
                </span>
                <span class="model-card-status">
                  <span class="proto-badges">
                    {shownProtocols(r).map((p) => <Badge probe={r.probes[p]} />)}
                  </span>
                  <span class="status-text">{statusText(r)}</span>
                </span>
                <span class="model-card-usage">
                  {fs
                    ? `${fmtTok(fs.usage.inputTokens)} / ${fmtTok(fs.usage.outputTokens)} / ${fmtTok(fs.usage.totalTokens)}`
                    : "in / out / total"}
                </span>
                {preview ? (
                  <span class="text-preview model-preview">{preview}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div class="add-model">
        <input
          class="mono"
          placeholder="自定义模型 id，如 my-model-x"
          value={newModel}
          onInput={(e) => setNewModel((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button disabled={!newModel.trim()} onClick={add}>
          添加模型
        </button>
      </div>
    </section>
  );
}
