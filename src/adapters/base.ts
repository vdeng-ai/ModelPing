import type { Protocol, TestRequest, Usage } from "../types.js";

// 流式增量片段。runner 负责把多次片段聚合成最终 TestResult。
export interface StreamChunk {
  text?: string;            // 本次新增文本
  usage?: Partial<Usage>;   // 本次可解析到的 usage（部分字段，runner 合并，最新非空者覆盖）
}

// 协议适配器统一接口。每个协议族实现一份，runner 与协议解耦。
export interface Adapter {
  protocol: Protocol;
  // 构造请求 URL（区分流式/非流式，如 gemini 端点不同）
  buildUrl(req: TestRequest): string;
  // 构造请求头（认证方式各异）
  buildHeaders(req: TestRequest): Record<string, string>;
  // 构造请求体
  buildBody(req: TestRequest): unknown;
  // 非流式：从完整响应 JSON 提取输出文本
  extractText(json: any): string;
  // 非流式：从完整响应 JSON 解析 token 用量
  parseUsage(json: any): Usage;
  // 流式：解析单个 SSE `data:` 负载（已 JSON.parse）。返回 null 表示该事件无可用增量。
  parseStreamChunk(payload: any): StreamChunk | null;
}

export const EMPTY_USAGE: Usage = { inputTokens: null, outputTokens: null, totalTokens: null };

// 去掉 baseUrl 尾部斜杠，避免拼出 // 。
export function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function stripHash(value: string): string {
  return value.split("#", 1)[0] ?? value;
}

function splitQuery(value: string): [string, string | null] {
  const idx = value.indexOf("?");
  return idx === -1 ? [value, null] : [value.slice(0, idx), value.slice(idx + 1)];
}

function mergeQueries(...queries: Array<string | null | undefined>): string | null {
  const parts = queries
    .filter((q): q is string => Boolean(q))
    .flatMap((q) => q.split("&"))
    .filter(Boolean);
  return parts.length ? parts.join("&") : null;
}

function appendQuery(url: string, query: string | null): string {
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function splitOriginAndPath(value: string): [string, string] {
  const schemeIdx = value.indexOf("://");
  if (schemeIdx === -1) return [value, ""];
  const authorityStart = schemeIdx + 3;
  const pathRel = value.slice(authorityStart).indexOf("/");
  if (pathRel === -1) return [value, ""];
  const pathStart = authorityStart + pathRel;
  return [value.slice(0, pathStart), value.slice(pathStart)];
}

// scheme://host 之后没有路径段的纯 origin。
export function isOriginOnlyUrl(value: string): boolean {
  const trimmed = trimSlash(stripHash(value).trim());
  const [, queryless] = splitQuery(trimmed);
  const base = queryless == null ? trimmed : trimmed.slice(0, trimmed.indexOf("?"));
  const [, path] = splitOriginAndPath(base);
  return !path || path === "/";
}

function collapseVersionDuplicates(url: string, version: "v1" | "v1beta"): string {
  const duplicate = `/${version}/${version}`;
  while (url.includes(duplicate)) url = url.replace(duplicate, `/${version}`);
  return url;
}

export function buildOpenAiUrl(req: TestRequest, endpoint: "chat/completions" | "responses"): string {
  if (req.isFullUrl) return stripHash(req.baseUrl.trim());

  const rawBase = stripHash(req.baseUrl.trim());
  const [baseWithoutQuery, baseQuery] = splitQuery(trimSlash(rawBase));
  const base = trimSlash(baseWithoutQuery);
  const path = endpoint.replace(/^\/+/, "");
  const url = base.endsWith("/v1")
    ? `${base}/${path}`
    : isOriginOnlyUrl(base)
      ? `${base}/v1/${path}`
      : `${base}/${path}`;
  return appendQuery(collapseVersionDuplicates(url, "v1"), baseQuery);
}

export function buildAnthropicUrl(req: TestRequest): string {
  if (req.isFullUrl) return stripHash(req.baseUrl.trim());
  const rawBase = stripHash(req.baseUrl.trim());
  const [baseWithoutQuery, baseQuery] = splitQuery(trimSlash(rawBase));
  const url = `${trimSlash(baseWithoutQuery)}/v1/messages`;
  return appendQuery(collapseVersionDuplicates(url, "v1"), baseQuery);
}

export function normalizeGeminiModelId(model: string): string {
  const trimmed = model.replace(/^\/+/, "");
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

function normalizeGeminiBasePath(path: string): string {
  const clean = trimSlash(path);
  if (!clean || clean === "/") return "";

  for (const marker of ["/v1beta/models/", "/v1/models/", "/models/"]) {
    const idx = clean.indexOf(marker);
    if (idx !== -1) return trimSlash(clean.slice(0, idx));
  }

  for (const suffix of [
    "/v1beta/openai/chat/completions",
    "/v1/openai/chat/completions",
    "/openai/chat/completions",
    "/v1beta/openai/responses",
    "/v1/openai/responses",
    "/openai/responses",
    "/v1beta/openai",
    "/v1/openai",
    "/openai",
    "/v1beta/models",
    "/v1/models",
    "/models",
    "/v1beta",
    "/v1",
  ]) {
    if (clean === suffix) return "";
    if (clean.endsWith(suffix)) return trimSlash(clean.slice(0, -suffix.length));
  }

  return clean;
}

function isStructuredGeminiMethodPath(path: string): boolean {
  return /\/models\/[^/?#]+:(streamGenerateContent|generateContent)\b/.test(path);
}

function withGeminiVerb(path: string, stream: boolean): string {
  const next = stream ? "streamGenerateContent" : "generateContent";
  return path.replace(/:(streamGenerateContent|generateContent)\b/, `:${next}`);
}

function withoutAltQuery(query: string | null): string | null {
  if (!query) return null;
  const parts = query.split("&").filter((part) => part && !part.startsWith("alt="));
  return parts.length ? parts.join("&") : null;
}

export function buildGeminiUrl(req: TestRequest): string {
  const verb = req.stream ? "streamGenerateContent" : "generateContent";
  const model = encodeURIComponent(normalizeGeminiModelId(req.model));
  const endpointPath = `/v1beta/models/${model}:${verb}`;
  const endpointQuery = req.stream ? "alt=sse" : null;
  const rawBase = trimSlash(stripHash(req.baseUrl.trim()));
  const [baseWithoutQuery, baseQuery] = splitQuery(rawBase);

  if (req.isFullUrl) {
    const [origin, path] = splitOriginAndPath(baseWithoutQuery);
    const structured = isStructuredGeminiMethodPath(path);
    const query = mergeQueries(req.stream || structured ? withoutAltQuery(baseQuery) : baseQuery, endpointQuery);
    const url = structured
      ? `${origin}${withGeminiVerb(path, req.stream)}`
      : baseWithoutQuery;
    return appendQuery(url, query);
  }

  const [origin, rawPath] = splitOriginAndPath(baseWithoutQuery);
  const prefix = normalizeGeminiBasePath(rawPath);
  const url = `${origin}${prefix}${endpointPath}`;
  return appendQuery(collapseVersionDuplicates(url, "v1beta"), mergeQueries(withoutAltQuery(baseQuery), endpointQuery));
}

// 安全数字：把可能的 undefined/null/非数字归一为 null。
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
