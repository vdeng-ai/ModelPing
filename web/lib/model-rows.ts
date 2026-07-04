import type { Protocol, ProviderPreset, StreamVerdict, TestResult } from "./types.js";
import { CUSTOM_PROVIDER_ID } from "./presets.js";
import { PROTOCOLS, protocolsForProvider } from "../../src/protocols.js";

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

let rowSeq = 0;

export function nextModelRowKey(): string {
  return `r${++rowSeq}`;
}

// 兼容旧调用点：自定义 provider 仍按模型名启发式选择协议。
export function protocolsForModel(name: string): Protocol[] {
  return protocolsForProvider(CUSTOM_PROVIDER_ID, name);
}

// 生成 4 个 idle 探针。
export function freshProbes(): Record<Protocol, ProtocolProbe> {
  const out = {} as Record<Protocol, ProtocolProbe>;
  for (const p of PROTOCOLS) {
    out[p] = { protocol: p, status: "idle", result: null, streamVerdict: null, streamTtftMs: null };
  }
  return out;
}

// 由全部供应商预设生成按官方名去重的模型行（每行含 4 个 idle 协议探针）。
export function buildRows(
  providers: ProviderPreset[],
  selectedProviderId = CUSTOM_PROVIDER_ID,
  makeKey: () => string = nextModelRowKey,
): ModelRow[] {
  const byLabel = new Map<string, ModelRow>();
  for (const provider of providers) {
    for (const m of provider.models) {
      const label = (m.label ?? m.id).trim();
      if (!label) continue;
      const existing = byLabel.get(label);
      if (existing) {
        existing.modelByProvider[provider.id] = m.id;
        if (selectedProviderId !== CUSTOM_PROVIDER_ID && provider.id === selectedProviderId) {
          existing.checked = true;
        }
      } else {
        byLabel.set(label, {
          key: makeKey(),
          label,
          modelByProvider: { [provider.id]: m.id },
          custom: false,
          checked: selectedProviderId !== CUSTOM_PROVIDER_ID && provider.id === selectedProviderId,
          probes: freshProbes(),
        });
      }
    }
  }
  return [...byLabel.values()];
}

export function selectRowsForProvider(rows: ModelRow[], providerId: string): ModelRow[] {
  return rows.map((row) => ({
    ...row,
    checked: providerId === CUSTOM_PROVIDER_ID ? row.custom : !row.custom && providerId in row.modelByProvider,
    probes: freshProbes(),
  }));
}

export function upsertCustomModelRows(
  rows: ModelRow[],
  ids: string[],
  makeKey: () => string = nextModelRowKey,
): ModelRow[] {
  const next = [...rows];
  for (const id of ids) {
    const model = id.trim();
    if (!model) continue;
    const idx = next.findIndex((row) => row.label === model);
    if (idx !== -1) {
      next[idx] = { ...next[idx], checked: true, probes: freshProbes() };
    } else {
      next.push({
        key: makeKey(),
        label: model,
        modelByProvider: {},
        custom: true,
        checked: true,
        probes: freshProbes(),
      });
    }
  }
  return next;
}
