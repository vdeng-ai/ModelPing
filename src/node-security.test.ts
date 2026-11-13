import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, relative } from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const PASSWORD = "local-security-test";
const SECRET = "protected-static-fixture";
let server: Server;
let port: number;
let directory: string;

// Do not use fetch/URL here: they normalize request paths before transmission,
// hiding the raw-backslash regression this suite is intended to catch.
function send(path: string, method = "GET", body?: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers, agent: false }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, headers: res.headers }));
    });
    req.setTimeout(3000, () => req.destroy(new Error("Local adapter request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

beforeAll(async () => {
  const parent = join(process.cwd(), "node_modules/.cache");
  await mkdir(parent, { recursive: true });
  directory = await mkdtemp(join(parent, "node-security-"));
  await mkdir(join(directory, "assets/private"), { recursive: true });
  await writeFile(join(directory, "assets/public.txt"), "public fixture");
  await writeFile(join(directory, "assets/private/secret.txt"), SECRET);
  const app = createApp();
  // A protected static fixture exercises the upstream double-decode advisory.
  app.use("/assets/private/*", async (c, next) => {
    if (c.req.header("x-app-password") !== PASSWORD) return c.text("Unauthorized", 401);
    await next();
  });
  app.use("/assets/*", serveStatic({ root: relative(process.cwd(), directory) }));
  app.post("/adapter-test/echo", async (c) => c.json(await c.req.json()));
  app.get("/adapter-test/stream", () => new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"text":"你好"}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } }));

  server = createAdaptorServer({
    fetch: (req) => app.fetch(req, { APP_PASSWORD: PASSWORD }),
    overrideGlobalObjects: false,
  }) as Server;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("patched Hono and Node adapter", () => {
  it("preserves public health checks and authenticated bootstrap", async () => {
    expect((await send("/api/health")).status).toBe(200);
    expect((await send("/api/bootstrap")).status).toBe(401);
    const response = await send("/api/bootstrap", "GET", undefined, { "x-app-password": PASSWORD });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).health.needPassword).toBe(true);
  });

  // GHSA-h7mg-cq63-vhpq: wildcard auth must also cover encoded line terminators.
  it.each(["%0A", "%0D", "%E2%80%A8", "%E2%80%A9"])(
    "keeps API authentication on a path containing %s", async (encoded) => {
      const response = await send(`/api/${encoded}unknown`);
      expect(response.status).toBe(401);
      expect(JSON.parse(response.body)).toEqual({ error: "访问口令错误" });
    },
  );

  // GHSA-jpvv-r467-5p4w: reject rather than reinterpret raw backslashes.
  it.each(["/api\\bootstrap", "/public\\..\\api/bootstrap"])(
    "rejects the raw request-target %s", async (path) => {
      expect((await send(path)).status).toBe(400);
    },
  );

  it("serves public GET/HEAD assets but not POST requests", async () => {
    const get = await send("/assets/public.txt");
    expect(get.status).toBe(200);
    expect(get.body).toBe("public fixture");
    const head = await send("/assets/public.txt", "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await send("/assets/public.txt", "POST")).status).toBe(404);
  });

  it("does not double-decode a static path around its auth middleware", async () => {
    expect((await send("/assets/private/secret.txt")).status).toBe(401);
    const allowed = await send("/assets/private/secret.txt", "GET", undefined, { "x-app-password": PASSWORD });
    expect(allowed.body).toBe(SECRET);
    // After one decode this still contains %70; a second decode would yield p.
    const crafted = await send("/assets/%%37%30rivate/secret.txt");
    expect([400, 401, 404]).toContain(crafted.status);
    expect(crafted.body).not.toContain(SECRET);
  });

  it("still parses Unicode JSON request bodies", async () => {
    const payload = { text: "你好 👋", input: "x".repeat(8192) };
    const response = await send("/adapter-test/echo", "POST", JSON.stringify(payload), { "content-type": "application/json" });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(payload);
  });

  it("preserves streamed SSE response chunks", async () => {
    const response = await send("/adapter-test/stream");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toBe('data: {"text":"你好"}\n\ndata: [DONE]\n\n');
  });
});
