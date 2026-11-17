// Capture the real production UI with deterministic, synthetic data only.
// No real backend, provider, credential, or upstream catalog is contacted.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "dist/client");
const output = join(root, "docs/screenshots");
const cache = join(root, "node_modules/.cache/readme-screenshots");
if (!existsSync(join(assets, "index.html"))) throw new Error("Run npm run build:cf first.");
for (const directory of [output, cache]) await mkdir(directory, { recursive: true });
process.env.TMPDIR = cache;
process.env.XDG_CONFIG_HOME = join(cache, "config");
process.env.XDG_CACHE_HOME = join(cache, "cache");
const demoKey = "sk-demo-not-a-real-key";
const demoUrl = "https://api.example.com/v1";
const fixedTime = Date.parse("2026-11-17T08:30:00.000Z");
const providers = [
  { id: "openai", name: "OpenAI · Demo", baseUrl: demoUrl, models: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }] },
  {
    id: "anthropic",
    name: "Anthropic · Demo",
    baseUrl: "https://anthropic.example.com",
    models: [{ id: "claude-sonnet-4-5" }],
  },
  {
    id: "gemini",
    name: "Google Gemini · Demo",
    baseUrl: "https://gemini.example.com",
    models: [{ id: "gemini-2.5-flash" }],
  },
  {
    id: "deepseek",
    name: "DeepSeek · Demo",
    baseUrl: "https://deepseek.example.com/v1",
    models: [{ id: "deepseek-chat" }],
  },
];
const fixture = {
  health: {
    ok: true,
    needPassword: false,
    persistence: { settings: true, privateState: true, privateStateScope: "config" },
    limits: { dailyRequestBudget: 60000, pingBatchSize: 10 },
  },
  settings: {
    providers,
    defaults: { input: "Hello", timeoutMs: 30000, maxRetries: 1, maxTokens: 512, concurrency: 2, userAgent: "" },
  },
  privateState: {
    v: 1,
    historyPersist: false,
    history: [],
    conn: { providerId: "custom", baseUrl: demoUrl, apiKey: demoKey, isFullUrl: false },
    config: null,
    customModelsPersist: false,
    customModels: [],
    updatedAt: fixedTime,
    statusEntries: providers.map((provider, index) => ({
      id: `demo-${index}`,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: demoKey,
      model: provider.models[0].id,
      protocol: provider.id === "anthropic" ? "anthropic" : provider.id === "gemini" ? "gemini" : "openai-chat",
    })),
  },
};
const catalog = {
  available: true,
  source: "models.dev",
  updatedAt: "2026-11-17T08:00:00.000Z",
  providers: providers.map((provider) => ({
    ...provider,
    docs: "",
    models: provider.models.map((model) => ({
      ...model,
      label: model.id,
      releaseDate: null,
      context: null,
      modalities: ["text"],
    })),
  })),
};
catalog.providers[0].models.push(
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", releaseDate: null, context: null, modalities: ["text"] },
  { id: "gpt-4o-mini", label: "GPT-4o mini", releaseDate: null, context: null, modalities: ["text"] },
);
const requests = [],
  unexpected = [],
  external = [],
  errors = [];
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = body ? JSON.parse(body) : null;
      requests.push(pathname);
      res.setHeader("content-type", "application/json");
      if (pathname === "/api/bootstrap" && req.method === "GET") return res.end(JSON.stringify(fixture));
      if (pathname === "/api/model-catalog" && req.method === "GET") return res.end(JSON.stringify(catalog));
      if (pathname === "/api/test-row" && req.method === "POST") {
        assert.equal(input.apiKey, demoKey);
        assert.ok(new URL(input.baseUrl).hostname.endsWith(".example.com"));
        const failed = input.model === "gpt-4.1-mini";
        const result = {
          ok: !failed,
          status: failed ? 401 : 200,
          latencyMs: failed ? 180 : 842,
          ttftMs: failed ? null : 156,
          usage: { inputTokens: failed ? null : 12, outputTokens: failed ? null : 24, totalTokens: failed ? null : 36 },
          text: failed ? "" : "Demo response: the endpoint is ready to accept your request.",
          error: failed ? "Demo: API key is not authorized for this model." : null,
          failureLog: failed ? "HTTP 401\nDemo authentication error. Check the API key and model permissions." : null,
          requestUrl: `${input.baseUrl}/chat/completions`,
          attempts: 1,
        };
        return res.end(
          JSON.stringify({
            results: Object.fromEntries(
              input.protocols.map((protocol) => [
                protocol,
                {
                  json: result,
                  stream: result,
                  streamVerdict: failed ? null : "stream",
                  streamTtftMs: failed ? null : 156,
                },
              ]),
            ),
          }),
        );
      }
      if (pathname === "/api/ping-batch" && req.method === "POST")
        return res.end(
          JSON.stringify({
            results: Object.fromEntries(
              input.entries.map((entry, index) => [
                entry.id,
                {
                  ok: index !== 2,
                  status: index === 2 ? 503 : 200,
                  latencyMs: 120 + index * 37,
                  kind: "models",
                  error: index === 2 ? "Demo: upstream temporarily unavailable" : null,
                },
              ]),
            ),
          }),
        );
      if (pathname === "/api/private-state" && req.method === "PUT") return res.end('{"ok":true}');
      unexpected.push(`${req.method} ${pathname}`);
      res.writeHead(404);
      return res.end('{"error":"Unmocked screenshot endpoint"}');
    }
    let path = resolve(assets, `.${decodeURIComponent(pathname)}`);
    if (path !== assets && !path.startsWith(assets + sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(path) || !(await stat(path)).isFile()) path = join(assets, "index.html");
    res.setHeader("content-type", mime[extname(path)] ?? "application/octet-stream");
    res.end(await readFile(path));
  } catch (error) {
    errors.push(String(error));
    res.writeHead(500);
    res.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
try {
  const executablePath =
    process.env.CHROME_PATH ||
    ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const lang of ["en", "zh"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      deviceScaleFactor: 1,
      locale: lang === "zh" ? "zh-CN" : "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (new URL(url).origin === origin) return route.continue();
      external.push(url);
      return route.abort();
    });
    await context.addInitScript(
      ({ lang, time }) => {
        if (!/^https?:$/.test(location.protocol)) return;
        localStorage.setItem("llm-test:lang", lang);
        localStorage.setItem("llm-test:theme", "light");
        const NativeDate = window.Date;
        window.Date = class extends NativeDate {
          constructor(...args) {
            if (args.length) super(...args);
            else super(time);
          }
          static now() {
            return time;
          }
        };
      },
      { lang, time: fixedTime },
    );
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    const settle = async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
    };
    const capture = async (name, fullPage = true) => {
      await settle();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${name}/${lang}: horizontal overflow`,
      );
      await page.mouse.move(1, 1);
      await page.screenshot({ path: join(output, `${name}-${lang}.png`), fullPage, animations: "disabled" });
      console.log(`Captured ${name}-${lang}.png`);
    };
    const navigate = async (hash) => {
      await page.locator(`.primary-nav a[href="${hash}"]`).click();
      await page.waitForFunction(
        (target) => document.querySelector(`.primary-nav a[href="${target}"]`)?.getAttribute("aria-current") === "page",
        hash,
      );
      await settle();
    };
    const choose = async (id) => {
      await page.locator('input[role="combobox"]').fill(id);
      await page
        .locator(".model-search-option")
        .filter({ has: page.locator("code").filter({ hasText: new RegExp(`^${id.replaceAll(".", "\\.")}$`) }) })
        .first()
        .click();
      assert.equal(await page.locator('input[role="combobox"]').inputValue(), id);
    };
    const run = async (id, state) => {
      await choose(id);
      await page.locator(".model-primary-actions > button.primary").click();
      await page.locator(`.model-result-row.${state}`).waitFor();
      await page.locator(".toast").waitFor({ state: "hidden" });
    };
    await page.goto(`${origin}/#test/models`);
    await page.locator(".model-result-row").first().waitFor();
    await page.locator("#connection-provider").selectOption("openai");
    await page.locator("#toolbox-input").fill(Buffer.from(demoUrl).toString("base64"));
    await page.waitForFunction((url) => document.querySelector("#toolbox-output")?.value === url, demoUrl);
    await run("gpt-4.1-mini", "fail");
    await run("gpt-4.1", "success");
    await page.locator(".detail-toggle").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture("workbench");

    await page.locator('input[role="combobox"]').fill("gpt");
    await page.locator(".model-search-option").filter({ hasText: "GPT-4.1 nano" }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture("model-search");
    await page.keyboard.press("Escape");
    await page.locator(".catalog-trigger").click();
    await page.locator(".model-catalog-item").first().waitFor();
    await page.locator(".model-catalog-item input:not(:disabled)").first().check();
    await capture("catalog", false);
    await page.keyboard.press("Escape");
    await page.locator(".config-trigger").click();
    await page.locator("#config-input").waitFor();
    await capture("parameters", false);
    await page.keyboard.press("Escape");

    await navigate("#test/history");
    await page.locator(".history-entry.fail .history-provider button[aria-expanded]").first().click();
    await page.locator(".history-inline-details.fail").waitFor();
    await capture("history");
    await navigate("#status");
    await page.locator(".status-toolbar > button.primary").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".status-result-cell .model-verdict.success, .status-result-cell .model-verdict.fail")
          .length === 4,
    );
    await capture("status");
    await navigate("#providers");
    await page.locator("#provider-name").waitFor();
    await capture("providers");
    await navigate("#test/models");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#toolbox-input").fill(Buffer.from(demoUrl).toString("base64"));
    await page.waitForFunction((url) => document.querySelector("#toolbox-output")?.value === url, demoUrl);
    // Open the actual connection disclosure, rather than restyling the mobile UI.
    if (!(await page.locator("#connection-base-url").isVisible()))
      await page.locator(".connection-panel > summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture("mobile");
    await context.close();
  }
  assert.deepEqual(errors, [], "No server or browser errors");
  assert.deepEqual(external, [], "All network requests must stay on the local fixture server");
  assert.deepEqual(unexpected, [], "All API calls must be explicitly mocked");
  assert.equal(requests.includes("/api/model-catalog/sync"), false, "Capturing the catalog must not sync it");
  console.log("16 screenshots captured from the production bundle; no external requests or real credentials.");
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(cache, "failure.png"), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
