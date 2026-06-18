import { createApp, type Env } from "./app.js";
import { createStore } from "./store/index.js";

// Cloudflare Workers 入口。复用框架无关的 app。
// 静态资源由 wrangler.toml 的 [assets] 绑定处理（非 /api 路由自动回退到 index.html，
// 通过 not_found_handling = "single-page-application" 实现 SPA 兜底），
// 这里只需把未命中的请求交给 ASSETS 取静态文件。
//
// 环境变量（Workers Bindings / Secrets）：
//   APP_PASSWORD   可选访问口令（建议用 `wrangler secret put APP_PASSWORD` 设置）
//   ALLOWED_HOSTS  可选目标主机白名单（逗号分隔）
interface WorkerEnv extends Env {
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  SETTINGS_KV?: unknown; // KV 命名空间绑定（wrangler.toml 配置）。
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
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext) {
    // 绑定了 SETTINGS_KV 则启用 cf-kv 持久化，注入到 c.env.store。
    const store = await createStore(env);
    return app.fetch(req, { ...env, store: store ?? undefined }, ctx);
  },
};
