import { createApp, type Env } from "./app.js";
import { CfKvStore } from "./store/cf-kv.js";

// Cloudflare Workers 入口。Cloudflare 只需要 KV/none 两种存储路径，直接构造 CfKvStore，
// 避免把 Node file driver / Vercel Blob driver / 通用 runtime 选择逻辑带进 Worker 依赖图。
interface WorkerEnv extends Env {
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  SETTINGS_KV?: unknown;
  STORAGE_DRIVER?: string;
}

function buildWorkerAppEnv(raw: WorkerEnv): Env {
  const driver = (raw.STORAGE_DRIVER ?? "").trim().toLowerCase();
  if (driver && driver !== "cf-kv" && driver !== "none") {
    throw new Error(`Cloudflare Worker 不支持 STORAGE_DRIVER=${driver}；仅支持 cf-kv / none`);
  }
  if (driver === "cf-kv" && !raw.SETTINGS_KV) {
    throw new Error("STORAGE_DRIVER=cf-kv 但缺少 SETTINGS_KV 绑定");
  }

  const useKv = driver !== "none" && Boolean(raw.SETTINGS_KV);
  const store = useKv ? new CfKvStore(raw.SETTINGS_KV as any, "presets") : undefined;
  const privateStore = useKv ? new CfKvStore(raw.SETTINGS_KV as any, "private") : undefined;

  return {
    APP_PASSWORD: raw.APP_PASSWORD,
    ALLOWED_HOSTS: raw.ALLOWED_HOSTS,
    CORS_ORIGIN: raw.CORS_ORIGIN,
    BLOCK_PRIVATE_HOSTS: raw.BLOCK_PRIVATE_HOSTS,
    STATUS_SECRET: raw.STATUS_SECRET,
    PRIVATE_STATE_SECRET: raw.PRIVATE_STATE_SECRET,
    PRIVATE_STATE_SCOPE: raw.PRIVATE_STATE_SCOPE,
    DAILY_REQUEST_BUDGET: raw.DAILY_REQUEST_BUDGET,
    store,
    privateStore,
  };
}

const app = createApp();

// 非 /api 路由交给静态资源绑定（SPA）。
app.all("*", async (c) => {
  if (c.req.path.startsWith("/api")) return c.notFound();
  const assets = (c.env as WorkerEnv).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.text("前端未构建或未绑定 ASSETS。", 200);
});

export default {
  fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return app.fetch(req, { ...env, ...buildWorkerAppEnv(env) }, ctx);
  },
};
