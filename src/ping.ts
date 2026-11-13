import type { PingBatchEntry, PingBatchResult, PingRequest, PingResult, LookupRequest, TestRequest } from "./types.js";
import { planFor } from "./models-fetch.js";
import { runTest } from "./runner.js";
import { fetchWithTimeout } from "./fetch-timeout.js";

// 端点延迟测速（不消耗 token）。
// 主路径：GET 供应商 /models（复用 models-fetch 的协议感知端点+认证），只测延迟与可达性。
// 回退：所有 /models 候选都 404/405（无该端点）时，发一次最小补全（max_tokens=1）取延迟。
// 批量路径会按连接身份去重 /models 探测；只有确实不支持 /models 时才按模型回退补全。

const PING_TIMEOUT_MS = 15000;
export const MAX_PING_BATCH_SIZE = 10;
const BATCH_GROUP_CONCURRENCY = 2;
const BATCH_FALLBACK_CONCURRENCY = 2;

function lookupOf(req: PingRequest): LookupRequest {
  return { baseUrl: req.baseUrl, isFullUrl: req.isFullUrl, apiKey: req.apiKey, userAgent: req.userAgent };
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal | undefined,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!signal?.aborted) {
      const item = items[cursor++];
      if (item === undefined) return;
      await task(item);
    }
  });
  await Promise.all(workers);
}

// 用最小补全测速：max_tokens=1、不流式、不重试、极短输入。
async function pingViaCompletion(req: PingRequest, signal?: AbortSignal): Promise<PingResult> {
  const testReq: TestRequest = {
    protocol: req.protocol,
    baseUrl: req.baseUrl,
    isFullUrl: req.isFullUrl,
    apiKey: req.apiKey,
    model: req.model,
    input: "hi",
    stream: false,
    timeoutMs: PING_TIMEOUT_MS,
    maxRetries: 0,
    maxTokens: 1,
    userAgent: req.userAgent ?? "",
  };
  const r = await runTest(testReq, signal);
  return { ok: r.ok, status: r.status, latencyMs: r.latencyMs, kind: "completion", error: r.error };
}

// 只探测 /models；全部候选均 404/405 时返回 null，交给调用方决定是否做模型级补全回退。
async function pingViaModels(req: PingRequest, signal?: AbortSignal): Promise<PingResult | null> {
  const plan = planFor(lookupOf(req));

  for (const url of plan.urls) {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(url, { method: "GET", headers: plan.headers }, PING_TIMEOUT_MS, signal);
      const latencyMs = Date.now() - start;
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404 || res.status === 405) continue;
      return { ok: res.ok, status: res.status, latencyMs, kind: "models", error: res.ok ? null : `HTTP ${res.status}` };
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      return {
        ok: false,
        status: 0,
        latencyMs: Date.now() - start,
        kind: "models",
        error: e?.message ?? String(e),
      };
    }
  }

  return null;
}

export async function pingEndpoint(req: PingRequest, signal?: AbortSignal): Promise<PingResult> {
  return (await pingViaModels(req, signal)) ?? pingViaCompletion(req, signal);
}

function connectionKey(req: PingRequest): string {
  return JSON.stringify([
    req.baseUrl.trim(),
    Boolean(req.isFullUrl),
    req.apiKey,
    req.userAgent ?? "",
  ]);
}

// 批量 Status 测速：
// 1) 同一连接只探测一次 /models；
// 2) 若 /models 存在，结果复用给组内所有模型；
// 3) 仅当 /models 全部 404/405 时，才逐模型做 max_tokens=1 的补全回退。
// 并发限制为 2×2，保守低于 Workers Free 每请求 6 个同时出站连接的上限。
export async function pingBatch(entries: PingBatchEntry[], signal?: AbortSignal): Promise<PingBatchResult> {
  const results: Record<string, PingResult> = {};
  const groups = new Map<string, PingBatchEntry[]>();
  for (const entry of entries) {
    const key = connectionKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  await runPool([...groups.values()], BATCH_GROUP_CONCURRENCY, signal, async (group) => {
    signal?.throwIfAborted();
    const shared = await pingViaModels(group[0], signal);
    if (shared) {
      for (const entry of group) results[entry.id] = shared;
      return;
    }

    await runPool(group, BATCH_FALLBACK_CONCURRENCY, signal, async (entry) => {
      signal?.throwIfAborted();
      results[entry.id] = await pingViaCompletion(entry, signal);
    });
  });

  return { results };
}

// 本次测速会请求的 /models 目标 URL（用于 allowlist 校验；补全回退同 host，host 校验已覆盖）。
export function pingTargetUrls(req: PingRequest): string[] {
  return planFor(lookupOf(req)).urls;
}
