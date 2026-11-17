// Integration tests against the production bundle. No real provider/API key is used.
// Uses local Chrome when available, otherwise Playwright's installed Chromium.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "dist/client");
const artifacts = join(root, "node_modules/.cache/toolbox-browser");
// Chrome's Unix socket path is limited to 108 bytes. Keep temporary profiles
// inside the project, but use a short path instead of the artifact directory.
const temp = join(root, "node_modules/.tmp");
await mkdir(artifacts, { recursive: true });
await mkdir(temp, { recursive: true });
process.env.TMPDIR = temp;
process.env.XDG_CACHE_HOME = join(artifacts, "cache");
process.env.XDG_CONFIG_HOME = join(artifacts, "config");
assert.ok(existsSync(join(assets, "index.html")), "Build first: npm run build");

const bootstrap = {
  health: {
    ok: true,
    needPassword: false,
    persistence: { settings: false, privateState: false, privateStateScope: "none" },
  },
  settings: {
    providers: [],
    defaults: { input: "Hello", timeoutMs: 30000, maxRetries: 1, maxTokens: 512, concurrency: 2, userAgent: "" },
  },
  privateState: null,
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    if (pathname === "/api/bootstrap") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(bootstrap));
      return;
    }
    if (pathname.startsWith("/api/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    let path = resolve(assets, `.${pathname}`);
    if (path !== assets && !path.startsWith(assets + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(path) || !(await stat(path)).isFile()) path = join(assets, "index.html");
    res.writeHead(200, { "content-type": `${mime[extname(path)] ?? "application/octet-stream"}; charset=utf-8` });
    res.end(await readFile(path));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
let checks = 0;

const check = async (name, test) => {
  await test();
  console.log(`✓ ${name}`);
  checks++;
};
const waitOutput = (target, value) =>
  target.waitForFunction((expected) => document.querySelector("#toolbox-output")?.value === expected, value);
const choose = (target, label) => target.getByRole("tab", { name: label, exact: true }).click();
const input = (target) => target.locator("#toolbox-input");
const button = (target, name) => target.getByRole("button", { name, exact: true });

try {
  const executablePath =
    process.env.CHROME_PATH ||
    ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(() => {
    // Playwright also evaluates init scripts on the opaque initial about:blank.
    if (!/^https?:$/.test(location.protocol)) return;
    localStorage.setItem("llm-test:lang", "zh");
    localStorage.setItem("llm-test:theme", "light");
  });
  const errors = [];
  const requests = [];
  context.on("page", (p) => p.on("pageerror", (error) => errors.push(error.message)));
  context.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method(), body: request.postData() }),
  );
  page = await context.newPage();
  const workers = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto(`${origin}/#test/models`);
  await input(page).waitFor();

  await check("11 tools, live Base64 auto detection and explicit overrides", async () => {
    assert.equal(await page.getByRole("tab").count(), 11);
    await input(page).fill("hello");
    await waitOutput(page, "aGVsbG8=");
    await button(page, "结果移到输入").click();
    await waitOutput(page, "hello");
    await button(page, "编码").click();
    await waitOutput(page, "YUdWc2JHOD0=");
    await button(page, "解码").click();
    await input(page).fill("%%%invalid%%%");
    await page.locator("#toolbox-error").waitFor();
    assert.equal(await page.locator("#toolbox-output").inputValue(), "");
    assert.ok(await button(page, "复制结果").isDisabled());
    await button(page, "自动").click();
    await input(page).fill("hello");
    await waitOutput(page, "aGVsbG8=");
    assert.ok(
      workers.some((url) => url.includes("toolbox.worker")),
      "Conversions should run in a worker",
    );
  });

  await check("copy, select-all, clear and examples", async () => {
    await button(page, "复制结果").click();
    await button(page, "已复制").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "aGVsbG8=");
    await page.locator("#toolbox-output").click();
    assert.deepEqual(
      await page.locator("#toolbox-output").evaluate((el) => [el.selectionStart, el.selectionEnd]),
      [0, 8],
    );
    await button(page, "清空").click();
    await waitOutput(page, "");
    await button(page, "填入示例").click();
    await waitOutput(page, "Hello, ModelPing!");
  });

  await check("all text codecs work in the real browser", async () => {
    const cases = [
      ["Base64", "你好 👋", Buffer.from("你好 👋").toString("base64")],
      ["Hex", "Hi", "48 69"],
      ["URL", "a + b", "a%20%2B%20b"],
      ["Base32", "foobar", "MZXW6YTBOI======"],
      ["Unicode", "你好", "\\u4f60\\u597d"],
      ["HTML", "<>&", "&lt;&gt;&amp;"],
      ["ROT", "Hello 123", "Uryyb 123"],
      ["摩斯电码", "SOS HELP", "... --- ... / .... . .-.. .--."],
    ];
    for (const [tool, value, expected] of cases) {
      await choose(page, tool);
      await input(page).fill(value);
      await waitOutput(page, expected);
      await button(page, "解码").click();
      await input(page).fill(expected);
      await waitOutput(page, value);
    }
  });

  await check("format options and per-tool drafts", async () => {
    await choose(page, "URL");
    await page.locator("#toolbox-urlMode").selectOption("form");
    await input(page).fill("a+b%2Bc");
    await waitOutput(page, "a b+c");
    await choose(page, "Hex");
    await button(page, "编码").click();
    await page.locator("#toolbox-hexSeparator").selectOption("colon");
    await page.locator("#toolbox-hexUppercase").check();
    await input(page).fill("你好");
    await waitOutput(page, "E4:BD:A0:E5:A5:BD");
    await choose(page, "URL");
    assert.equal(await input(page).inputValue(), "a+b%2Bc");
    await waitOutput(page, "a b+c");
  });

  await check("HTML decoding does not execute markup or fetch resources", async () => {
    await choose(page, "HTML");
    await input(page).fill('&lt;img src="/toolbox-xss-probe" onerror="window.toolboxXss=1"&gt;');
    await waitOutput(page, '<img src="/toolbox-xss-probe" onerror="window.toolboxXss=1">');
    assert.equal(await page.evaluate(() => window.toolboxXss), undefined);
    assert.ok(!requests.some((request) => request.url.includes("toolbox-xss-probe")));
  });

  await check("JWT decode/sign/verify, wrong key and unsupported algorithm", async () => {
    await choose(page, "JWT");
    await button(page, "填入示例").click();
    await page.getByText("HMAC 签名匹配（不代表身份或权限可信）", { exact: true }).waitFor();
    assert.equal(JSON.parse(await page.locator("#toolbox-output").inputValue()).payload.name, "ModelPing");
    await page.locator("#toolbox-secret").fill("wrong-secret");
    await page.getByText("签名不匹配：密钥错误或内容已被修改", { exact: true }).waitFor();
    await button(page, "签名生成").click();
    await page.locator("#toolbox-jwtAlgorithm").selectOption("HS512");
    await button(page, "填入示例").click();
    await page.waitForFunction(() => document.querySelector("#toolbox-output")?.value.split(".").length === 3);
    const token = await page.locator("#toolbox-output").inputValue();
    await button(page, "结果移到输入").click();
    await button(page, "解析 / 验签").click();
    await page.getByText("HMAC 签名匹配（不代表身份或权限可信）", { exact: true }).waitFor();
    assert.equal(await input(page).inputValue(), token);
    await page.locator("#toolbox-jwtAlgorithm").selectOption("HS256");
    await page.getByText("令牌算法与所选预期算法不一致，未执行验签", { exact: true }).waitFor();
    const unsupported = `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from('{"sub":"demo"}').toString("base64url")}.AQID`;
    await input(page).fill(unsupported);
    await page.getByText("仅解析：此算法或扩展不支持本地验签", { exact: true }).waitFor();
  });

  await check("five hashes, empty-string hashing and Base64 output", async () => {
    await choose(page, "哈希");
    await input(page).fill("abc");
    for (const algorithm of ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"]) {
      await page.locator("#toolbox-hashAlgorithm").selectOption(algorithm);
      await waitOutput(page, createHash(algorithm.toLowerCase().replace("-", "")).update("abc").digest("hex"));
    }
    await page.locator("#toolbox-hashFormat").selectOption("base64");
    await waitOutput(page, createHash("sha512").update("abc").digest("base64"));
    await button(page, "清空").click();
    await waitOutput(page, createHash("sha512").update("").digest("base64"));
  });

  await check("no conversion uploads, no persisted drafts or secrets", async () => {
    await choose(page, "JWT");
    await input(page).fill("private-toolbox-input-marker");
    await page.locator("#toolbox-secret").fill("private-toolbox-secret-marker");
    const stored = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    assert.ok(!stored.includes("private-toolbox-"));
    assert.ok(!requests.some((request) => request.method !== "GET" || request.body));
    assert.equal(requests.filter((request) => new URL(request.url).pathname.startsWith("/api/")).length, 1);
    assert.ok(
      requests.every((request) => request.url.startsWith(origin)),
      "No external requests",
    );
  });

  await check("keyboard navigation, live language switch and responsive themes", async () => {
    const selected = page.getByRole("tab", { selected: true });
    await selected.focus();
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => document.activeElement.id), "toolbox-tab-quick-base64");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement.id), "toolbox-tab-hash");
    await choose(page, "快速 Base64");
    await button(page, "清空").click();
    await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en");
    await page.getByRole("heading", { name: "Credential Decode + API Test" }).waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Horizontal overflow at ${width}px: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].map((el) => ({ tag: el.tagName, cls: typeof el.className === "string" ? el.className : "", right: Math.round(el.getBoundingClientRect().right), left: Math.round(el.getBoundingClientRect().left), width: Math.round(el.getBoundingClientRect().width) })).filter((x) => x.right > innerWidth + 1 || x.left < -1).sort((a,b) => b.right-a.right).slice(0,8)))}`,
      );
      if (width <= 760) {
        const navigation = await page.locator(".primary-nav .nav-item").evaluateAll((items) =>
          items.map((item) => {
            const rect = item.getBoundingClientRect();
            return { top: rect.top, left: rect.left, right: rect.right };
          }),
        );
        assert.equal(navigation.length, 4);
        assert.ok(
          navigation.every((item) => Math.abs(item.top - navigation[0].top) < 1),
          "All five mobile navigation items must share one row",
        );
        assert.ok(
          navigation.every((item) => item.left >= 0 && item.right <= width + 1),
          "Mobile navigation must fit the viewport",
        );
      }
      if (width === 1440 || width === 390)
        await page.screenshot({ path: join(artifacts, `toolbox-en-light-${width}.png`), fullPage: true });
    }
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh");
    await button(page, "暗黑").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: join(artifacts, "toolbox-zh-dark-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await button(page, "白天").click();
    await page.screenshot({ path: join(artifacts, "toolbox-zh-light-desktop.png"), fullPage: true });
  });

  await check("latest-input wins and invalid input clears previous output", async () => {
    await input(page).fill("a".repeat(200_000));
    await page.waitForTimeout(140);
    await input(page).fill("final-input");
    await waitOutput(page, Buffer.from("final-input").toString("base64"));
    await button(page, "解码").click();
    await input(page).fill("%invalid");
    await page.locator("#toolbox-error").waitFor();
    assert.equal(await page.locator("#toolbox-output").inputValue(), "");
  });

  await check("preferences survive reload but content and secret do not", async () => {
    await choose(page, "JWT");
    await page.reload();
    await page.locator("#toolbox-secret").waitFor();
    assert.equal(await input(page).inputValue(), "");
    assert.equal(await page.locator("#toolbox-secret").inputValue(), "");
    assert.equal(await page.getByRole("tab", { selected: true }).textContent(), "JWT");
    await choose(page, "Hex");
    assert.equal(await page.locator("#toolbox-hexSeparator").inputValue(), "colon");
    assert.ok(await page.locator("#toolbox-hexUppercase").isChecked());
  });

  await check("existing navigation and browser back/forward still work", async () => {
    await page.getByRole("link", { name: "测试", exact: true }).click();
    await page.getByRole("heading", { name: "凭据解码 + API 测试", exact: true }).waitFor();
    await page.getByRole("link", { name: "供应商与模型", exact: true }).click();
    assert.ok(page.url().endsWith("#providers"));
    await page.goBack();
    assert.ok(page.url().endsWith("#test/models"));
    await page.getByRole("link", { name: "测试", exact: true }).click();
    await input(page).waitFor();
    assert.ok(page.url().endsWith("#test/models"));
    assert.equal(await input(page).inputValue(), "");
  });

  await check("clipboard denial has a manual fallback and cleans temporary DOM", async () => {
    await choose(page, "快速 Base64");
    await button(page, "自动").click();
    await input(page).fill("clipboard-test");
    await waitOutput(page, Buffer.from("clipboard-test").toString("base64"));
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
      document.execCommand = () => {
        throw new Error("denied");
      };
    });
    await button(page, "复制结果").click();
    await button(page, "复制失败，请手动复制").waitFor();
    assert.equal(await page.locator("body > textarea").count(), 0);
    assert.ok(
      await page
        .locator("#toolbox-output")
        .evaluate((el) => el.selectionEnd === el.value.length && el.selectionStart === 0),
    );
  });
  assert.deepEqual(errors, [], "No uncaught browser errors");

  await check("blocked storage and Worker fall back without disabling local tools", async () => {
    const fallback = await browser.newContext();
    await fallback.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("storage denied");
      };
      Storage.prototype.setItem = () => {
        throw new Error("storage denied");
      };
      window.Worker = class {
        constructor() {
          throw new Error("workers denied");
        }
      };
    });
    const target = await fallback.newPage();
    const exceptions = [];
    target.on("pageerror", (error) => exceptions.push(error.message));
    await target.goto(`${origin}/#test/models`);
    await input(target).fill("hello");
    await waitOutput(target, "aGVsbG8=");
    await target
      .getByText("Preferences cannot be saved in this browser. All tools still work for this session.", {
        exact: false,
      })
      .waitFor();
    assert.deepEqual(exceptions, []);
    await fallback.close();
  });

  await check("backend unavailable does not break local tools; password gate remains", async () => {
    const offline = await browser.newContext();
    await offline.route("**/api/bootstrap", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' }),
    );
    const target = await offline.newPage();
    await target.goto(`${origin}/#test/models`);
    await input(target).fill("hello");
    await waitOutput(target, "aGVsbG8=");
    await offline.close();
    const locked = await browser.newContext();
    await locked.route("**/api/bootstrap", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"password required"}' }),
    );
    const gate = await locked.newPage();
    await gate.goto(`${origin}/#test/models`);
    await gate.getByRole("heading", { name: "Access password required" }).waitFor();
    const mark = await gate.locator("img.pw-gate-logo").evaluate(async (image) => {
      await image.decode();
      return { src: image.currentSrc, icon: document.querySelector('link[rel="icon"]').href, width: image.naturalWidth };
    });
    assert.equal(mark.src, mark.icon, "The password gate uses the same artwork as the favicon");
    assert.equal(mark.width, 38);
    assert.equal(await input(gate).count(), 0);
    await locked.close();
  });
  console.log(`\n${checks} browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
