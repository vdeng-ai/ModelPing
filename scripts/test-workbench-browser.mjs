// Production-bundle regression tests. All API calls terminate at this local fixture.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "dist/client");
const artifacts = join(root, "node_modules/.cache/workbench-browser");
const temp = join(root, "node_modules/.tmp");
await mkdir(artifacts, { recursive: true });
await mkdir(temp, { recursive: true });
process.env.TMPDIR = temp;
const result = (model) => ({
  ok: model !== "model-10",
  status: model === "model-10" ? 401 : 200,
  latencyMs: 180,
  ttftMs: 40,
  usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
  text: "Local test response",
  error: model === "model-10" ? "Invalid test key" : null,
  requestUrl: "https://fixture.example/v1/chat/completions",
  attempts: 1,
});
const fixture = {
  health: {
    ok: true,
    needPassword: false,
    persistence: { settings: true, privateState: true, privateStateScope: "config" },
    limits: { dailyRequestBudget: 60000, pingBatchSize: 10 },
  },
  settings: {
    providers: [
      {
        id: "openai",
        name: "Fixture Provider",
        baseUrl: "https://fixture.example/v1",
        models: [{ id: "model-10" }, { id: "model-2" }, { id: "model-1" }],
      },
    ],
    defaults: { input: "Hello", timeoutMs: 30000, maxRetries: 0, maxTokens: 64, concurrency: 2, userAgent: "" },
  },
  privateState: {
    v: 1,
    historyPersist: false,
    history: [],
    conn: { providerId: "custom", baseUrl: "https://fixture.example/v1", apiKey: "test-only-secret", isFullUrl: false },
    config: null,
    customModelsPersist: false,
    customModels: [],
    statusEntries: Array.from({ length: 11 }, (_, index) => ({
      id: `endpoint-${index}`,
      providerName: "Fixture Provider",
      protocol: "openai-chat",
      baseUrl: "https://fixture.example/v1",
      apiKey: "test-only-secret",
      model: `model-${index}`,
    })),
    updatedAt: 1234,
  },
};
const requests = [];
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
      requests.push({ pathname, method: req.method, input });
      res.setHeader("content-type", "application/json");
      if (pathname === "/api/bootstrap") return res.end(JSON.stringify(fixture));
      if (pathname === "/api/model-catalog" && req.method === "GET") return res.end(JSON.stringify({
        available: true,
        updatedAt: "2026-11-14T00:00:00.000Z",
        source: "models.dev",
        providers: [{ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", docs: "", models: [
          { id: "gpt-new", label: "GPT New", releaseDate: "2026-11-01", context: 128000, modalities: ["text"] },
          { id: "gpt-existing", label: "GPT Existing", releaseDate: null, context: null, modalities: [] },
        ] }],
      }));
      if (pathname === "/api/model-catalog/sync" && req.method === "POST") return res.end(JSON.stringify({
        available: true, updatedAt: "2026-11-14T00:00:00.000Z", source: "models.dev",
        providers: [{ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", docs: "", models: [{ id: "gpt-new", label: "GPT New", releaseDate: null, context: 128000, modalities: ["text"] }] }],
      }));
      if (pathname === "/api/ping-batch")
        return res.end(
          JSON.stringify({
            results: Object.fromEntries(
              input.entries.map((entry) => [
                entry.id,
                { ok: true, status: 200, latencyMs: 24, kind: "models", error: null },
              ]),
            ),
          }),
        );
      if (pathname === "/api/test-row")
        return res.end(
          JSON.stringify({
            results: Object.fromEntries(
              input.protocols.map((protocol) => [
                protocol,
                { json: result(input.model), stream: result(input.model), streamVerdict: "stream", streamTtftMs: 40 },
              ]),
            ),
          }),
        );
      if (req.method === "PUT") return res.end('{"ok":true}');
      res.writeHead(404);
      return res.end('{"error":"unmocked endpoint"}');
    }
    let path = resolve(assets, `.${decodeURIComponent(pathname)}`);
    if (path !== assets && !path.startsWith(assets + sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(path) || !(await stat(path)).isFile()) path = join(assets, "index.html");
    res.setHeader("content-type", mime[extname(path)] ?? "application/octet-stream");
    res.end(await readFile(path));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`✓ ${name}`);
};
const count = (path) => requests.filter((request) => request.pathname === path).length;
let browser,
  page,
  checks = 0;
try {
  const executablePath =
    process.env.CHROME_PATH ||
    ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [],
    externalRequests = [];
  context.on("request", (request) => {
    if (!request.url().startsWith(origin)) externalRequests.push(request.url());
  });
  context.on("page", (target) => target.on("pageerror", (error) => errors.push(error.message)));
  await context.addInitScript(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    localStorage.setItem("llm-test:lang", "zh");
    localStorage.setItem("llm-test:theme", "light");
    // Trigger only status polling timers on demand. No real 30-second waits or probes.
    const originalSet = window.setInterval.bind(window),
      originalClear = window.clearInterval.bind(window);
    const timers = new Map();
    let sequence = 1_000_000;
    window.__statusTimers = timers;
    window.setInterval = (callback, delay, ...args) => {
      if (delay >= 30_000) {
        const id = sequence++;
        timers.set(id, () => callback(...args));
        return id;
      }
      return originalSet(callback, delay, ...args);
    };
    window.clearInterval = (id) => {
      timers.delete(id);
      originalClear(id);
    };
    window.__tickStatus = () => {
      for (const callback of timers.values()) callback();
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  const navigate = async (name) => {
    await page.getByRole("link", { name, exact: true }).click();
    await page.waitForFunction(
      (label) =>
        !!document.querySelector("dialog[open]") ||
        document.querySelector('.primary-nav [aria-current="page"]')?.textContent.trim() === label,
      name,
    );
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(`${origin}/#test/models`);
  await page.locator(".model-result-row").first().waitFor();

  await check("local navigation, search, sort and density add zero API requests", async () => {
    assert.equal(count("/api/bootstrap"), 1);
    await page.getByRole("combobox", { name: "排序方式" }).selectOption("name");
    assert.deepEqual(await page.locator(".model-name").allTextContents(), ["model-1", "model-2", "model-10"]);
    const search = page.getByRole("searchbox", { name: /搜索模型/ });
    await search.fill("model-2");
    assert.equal(await page.locator(".model-result-row").count(), 1);
    await button("重置筛选").click();
    await button("紧凑密度").click();
    assert.equal(await page.locator(".app-shell").getAttribute("data-density"), "compact");
    assert.equal(await page.evaluate(() => localStorage.getItem("modelping:ui-density")), "compact");
    for (const name of ["历史记录", "状态", "供应商", "工具箱", "测试"]) await navigate(name);
    await page.waitForTimeout(7500); // Covers the existing 7-second save debounce as well.
    assert.deepEqual(
      requests.map((request) => request.pathname),
      ["/api/bootstrap", "/api/model-catalog"],
    );
  });

  await check("native command dialog contains focus, closes with Escape and navigates by keyboard", async () => {
    const trigger = page.getByRole("button", { name: /^快速跳转/ }).first();
    await trigger.focus();
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").waitFor();
    assert.ok(await page.locator("dialog").evaluate((element) => element.matches(":modal")));
    await page.getByRole("combobox", { name: "搜索页面…" }).fill("状态");
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "端点状态", level: 1, exact: true }).waitFor();
    assert.ok(page.url().endsWith("#status"));
    await trigger.click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
    await page.goBack();
    await page.locator(".model-panel").waitFor();
    await page.locator("#main-content").focus();
    await page.keyboard.press("/");
    assert.equal(await page.evaluate(() => document.activeElement.type), "search");
  });

  await check("default status mode has no polling; 11 manual checks use two batched requests", async () => {
    await navigate("状态");
    assert.equal(await page.getByRole("combobox", { name: "自动刷新", exact: true }).inputValue(), "0");
    assert.equal(await page.evaluate(() => window.__statusTimers.size), 0);
    await page.evaluate(() => window.__tickStatus());
    assert.equal(count("/api/ping-batch"), 0);
    await page.locator(".status-toolbar > button.primary").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".status-result-cell .model-verdict.success").length === 11,
    );
    assert.equal(count("/api/ping-batch"), 2);
    assert.deepEqual(
      requests
        .filter((r) => r.pathname === "/api/ping-batch")
        .map((r) => r.input.entries.length)
        .sort((a, b) => a - b),
      [1, 10],
    );
    await page.getByRole("searchbox", { name: /搜索/ }).fill("model-4");
    assert.equal(await page.locator(".status-entry").count(), 1);
    assert.equal(count("/api/ping-batch"), 2);
    await page.getByRole("searchbox", { name: /搜索/ }).fill("");
  });

  await check("automatic refresh requires opt-in and pauses when hidden or offline", async () => {
    await page.getByRole("combobox", { name: "自动刷新", exact: true }).selectOption("30");
    await page.waitForFunction(() => window.__statusTimers.size === 1);
    await page.evaluate(() => window.__tickStatus());
    await page.waitForFunction(
      () => document.querySelectorAll(".status-result-cell .model-verdict.success").length === 11,
    );
    assert.equal(count("/api/ping-batch"), 4);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__statusTimers.size === 0);
    await page.evaluate(() => window.__tickStatus());
    assert.equal(count("/api/ping-batch"), 4);
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__statusTimers.size === 1);
    await context.setOffline(true);
    await page.waitForFunction(() => window.__statusTimers.size === 0);
    assert.ok(await page.locator(".status-toolbar > button.primary").isDisabled());
    await context.setOffline(false);
    await page.waitForFunction(() => window.__statusTimers.size === 1);
  });

  await check("two tabs share one polling leader; leaving Status stops the timer", async () => {
    const second = await context.newPage();
    await second.goto(`${origin}/#status`);
    await second.getByRole("combobox", { name: "自动刷新", exact: true }).selectOption("30");
    await second.waitForTimeout(200);
    assert.equal(await second.evaluate(() => window.__statusTimers.size), 0);
    await page.getByRole("combobox", { name: "自动刷新", exact: true }).selectOption("0");
    await second.waitForFunction(() => window.__statusTimers.size === 1);
    await second.close();
    await navigate("测试");
    assert.equal(await page.evaluate(() => window.__statusTimers.size), 0);
  });

  await check("models run only on explicit action; results and redacted filtered exports work", async () => {
    await page.locator("#connection-provider").selectOption("openai");
    await page.locator(".model-primary-actions > button.primary").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".model-result-row.success,.model-result-row.fail").length === 3,
    );
    assert.equal(count("/api/test-row"), 3);
    await navigate("历史记录");
    assert.ok((await page.locator(".history-model").count()) >= 3);
    await page.getByRole("searchbox", { name: /搜索/ }).fill("model-2");
    const downloadPromise = page.waitForEvent("download");
    await button("导出筛选结果").click();
    const downloaded = await downloadPromise;
    const entries = JSON.parse(await readFile(await downloaded.path(), "utf8"));
    assert.ok(entries.length > 0);
    assert.ok(entries.every((entry) => entry.model === "model-2" && !("apiKey" in entry)));
    await page.getByRole("searchbox", { name: /搜索/ }).fill("");
    await page.locator(".history-provider button[aria-expanded]").first().click();
    await page.locator(".history-inline-details").first().waitFor();
    await page.screenshot({ path: join(artifacts, "history-desktop.png"), fullPage: true });
  });

  await check("dirty provider changes are guarded and native confirmation returns focus", async () => {
    await navigate("供应商");
    await page.locator("#provider-name").fill("Unsaved fixture name");
    await navigate("测试");
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    assert.ok(page.url().endsWith("#providers"));
    assert.equal(await page.locator("#provider-name").inputValue(), "Unsaved fixture name");
    await navigate("测试");
    await page.getByRole("alertdialog").locator("button.danger").click();
    await page.locator(".model-panel").waitFor();
  });

  await check("custom-model dialog validates input, closes and restores focus", async () => {
    const trigger = page.locator(".add-model-trigger");
    await trigger.click();
    const dialog = page.getByRole("dialog");
    assert.ok(await dialog.locator("button.primary").isDisabled());
    await dialog.locator("input").fill("custom-fixture-model");
    await page.keyboard.press("Enter");
    await page.getByText("custom-fixture-model", { exact: true }).waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.ok(await trigger.evaluate((element) => document.activeElement === element));
    assert.equal(count("/api/test-row"), 3, "Adding a model must not run it");
  });

  await check("model catalog is read from cache; sync is manual and selected models join presets", async () => {
    await navigate("供应商");
    await page.locator(".model-catalog-panel").locator("summary").click();
    await page.getByRole("button", { name: "检查并更新目录" }).waitFor();
    assert.equal(count("/api/model-catalog/sync"), 0, "Opening the catalog must not trigger external sync");
    await page.getByRole("button", { name: "检查并更新目录" }).click();
    await page.getByText("GPT New", { exact: true }).waitFor();
    assert.equal(count("/api/model-catalog/sync"), 1);
    await page.locator(".model-catalog-controls select").nth(0).selectOption("openai");
    await page.locator(".model-catalog-item input").first().check();
    await page.getByRole("button", { name: "加入供应商预设" }).click();
    await page.getByText("已加入 1 个模型").waitFor();
    assert.equal(count("/api/model-catalog/sync"), 1, "Adding models must not refetch the catalog");
  });

  await check("all five pages fit 320/390/768/1440 pixels in light and dark themes", async () => {
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const name of ["测试", "历史记录", "状态", "供应商", "工具箱"]) {
          await navigate(name);
          await page.waitForTimeout(80);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${name} overflow at ${width}px/${theme}`,
          );
          assert.equal(await page.locator("h1").count(), 1);
          if (width <= 760) {
            const items = await page.locator(".primary-nav a").evaluateAll((links) =>
              links.map((link) => {
                const r = link.getBoundingClientRect();
                return { y: r.y, left: r.left, right: r.right };
              }),
            );
            assert.equal(items.length, 5);
            assert.ok(
              items.every((item) => Math.abs(item.y - items[0].y) < 1 && item.left >= 0 && item.right <= width),
            );
          }
          if ((width === 1440 || width === 390) && ["测试", "状态", "供应商"].includes(name))
            await page.screenshot({ path: join(artifacts, `${name}-${theme}-${width}.png`), fullPage: true });
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button("快速跳转").click();
    assert.equal(await page.locator("dialog").evaluate((dialog) => getComputedStyle(dialog).animationName), "none");
    await page.keyboard.press("Escape");
  });
  assert.deepEqual(errors, [], "No uncaught browser errors");
  assert.deepEqual(externalRequests, [], "No external requests; no real credentials or providers");
  console.log(`\n${checks} workbench browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
