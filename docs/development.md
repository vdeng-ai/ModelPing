# Development and maintenance

[Documentation](./README.md) · [简体中文](./development.zh-CN.md)

## Local development

The package declares Node.js `>=20`; CI and the Dockerfile use Node.js 22. Install from the committed lockfile:

```bash
git clone https://github.com/vdeng-ai/ModelPing.git
cd ModelPing
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite serves the frontend and proxies API traffic to the Node backend on port `8787`. For a built, same-origin instance:

```bash
npm run build
npm start
```

Open `http://localhost:8787`. The Node entry reads `process.env`; `npm start` does not load `.env` automatically. Use exported environment variables or `node --env-file=.env dist/server/node.js`. See [deployment and configuration](./deployment.md) before exposing a server publicly.

## Project map

| Path                                                   | Responsibility                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `web/components/App.tsx`                               | Routing, connection/configuration state, selection, persistence coordination |
| `web/components/ToolboxPanel.tsx`                      | Local credential decoding; input/output and transfer actions                 |
| `web/components/ConnectionPanel.tsx`                   | Provider/URL/key fields, model-list lookup and balance lookup                |
| `web/components/ModelSelect.tsx`                       | Searchable model picker, keyboard and touch behavior                         |
| `web/components/useModelCatalog.ts`                    | Lazy shared catalog state for search and the catalog dialog                  |
| `web/components/ModelCatalogPanel.tsx`                 | Explicit catalog refresh and import into provider presets                    |
| `web/components/ModelTable.tsx`                        | Selected model, directly visible actions, request settings and results       |
| `web/components/ConfigPanel.tsx`                       | Fields inside the advanced-parameters dialog                                 |
| `web/components/HistoryPanel.tsx`                      | Session history, filtering, diagnostics and redacted JSON export             |
| `web/components/StatusPanel.tsx`                       | Manual/opt-in checks and multi-tab polling coordination                      |
| `web/components/SettingsPanel.tsx`                     | Provider/model editing and import/export                                     |
| `web/lib/`                                             | API calls, locales, codecs, model selection, preferences and state helpers   |
| `web/public/presets.json`                              | Bundled providers, model IDs and parameter defaults                          |
| `web/design-system/`                                   | Semantic tokens, layout and component styling contracts                      |
| `src/adapters/`                                        | OpenAI Chat/Responses, Gemini and Anthropic request/response adapters        |
| `src/runner.ts`, `src/sse.ts`                          | Timeouts/retries, SSE parsing, usage and failure diagnostics                 |
| `src/protocols.ts`                                     | Provider/model protocol-selection rules                                      |
| `src/app.ts`                                           | Shared Hono API, validation, access checks, persistence and catalog routes   |
| `src/balance.ts`, `src/models-fetch.ts`, `src/ping.ts` | Balance, model discovery and status probes                                   |
| `src/private-state.ts`, `src/store/`                   | Private-state schema and file/KV/Blob stores                                 |
| `src/env.ts`, `src/node.ts`                            | Runtime environment injection and Node server                                |
| `src/worker.ts`, `api/index.ts`                        | Cloudflare Worker and Vercel entry points                                    |
| `scripts/`                                             | Browser regressions and reproducible documentation screenshots               |
| `.github/workflows/`                                   | CI verification/audit and Docker image publishing                            |

The [design-system contract](../web/design-system/README.md), [model-selection workflow](./model-selection-workflow.md), and [catalog integration](./model-catalog.md) explain the intended boundaries.

## Commands

| Command                                     | Purpose                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                               | Run Vite and the Node API with reload                                |
| `npm run build`                             | Build `dist/client` and `dist/server`                                |
| `npm start`                                 | Run the already-built Node server                                    |
| `npm run preview`                           | Build, then run the Node server                                      |
| `npm run build:cf` / `npm run build:vercel` | Build frontend assets for the selected platform                      |
| `npm run deploy:cf`                         | Build assets and invoke Wrangler deployment                          |
| `npm run typecheck`                         | TypeScript checks without emitting files                             |
| `npm run lint`                              | ESLint                                                               |
| `npm test` / `npm run test:watch`           | Unit tests / watch mode                                              |
| `npm run verify`                            | Typecheck, lint, unit tests and production build                     |
| `npm run audit:prod`                        | Audit the production dependency tree                                 |
| `npm run test:workbench:browser`            | Build and run workbench browser regressions                          |
| `npm run test:toolbox:browser`              | Build and run decoder browser regressions                            |
| `npm run docs:screenshots`                  | Build and capture the current interface in both languages            |
| `npm run docs:check`                        | Check public documentation links, anchors and screenshot files       |
| `npm run format`                            | Format the repository; review unrelated formatting before committing |

## Verification

```bash
npm run verify
npm run test:workbench:browser
npm run test:toolbox:browser
npm run docs:check
```

Browser suites prefer installed Chrome/Chromium. Set `CHROME_PATH` to override it, or install the Playwright browser with `npx playwright install chromium`. They serve a local production bundle with mocked APIs; they do not require real keys or paid provider requests. Artifacts live under `node_modules/.cache/workbench-browser/` and `node_modules/.cache/toolbox-browser/`.

The workbench suite covers model IDs, deduplication, protocol selection, lazy/manual catalog access, keyboard/IME/touch selection, dialog focus, guarded edits, history export, Status batching and polling, and layouts at 320/390/768/1440 pixels in both themes. The decoder suite covers the codecs, JWT/hashes, local-only behavior, storage/Worker/clipboard failures and navigation. Passing these checks is not a live-provider compatibility guarantee or a complete accessibility audit.

## Updating README screenshots

```bash
npm run docs:screenshots
npm run docs:check
```

The capture script writes eight views per language to `docs/screenshots/`: the workbench, model search, catalog, parameters, history, status, providers and mobile. It uses fixed demo data, `.example.com` endpoints, a clearly fake key, a local fixture server, a fixed clock and an external-request block. It never opens a real user instance or updates a real catalog. Open the generated PNGs for visual review; do not infer visual quality only from a passing command.

Desktop captures use 1440-pixel width, mobile captures use 390 pixels, and both use the light theme. English README images use `-en`; Chinese README images use `-zh`. Keep the synthetic-data caption in both READMEs. See [screenshot review](./design-qa.md).

## Maintenance rules

Keep product introduction and normal usage in the root READMEs. Keep development, deployment, architecture and verification instructions in `docs/`, with language links and relative repository links. `.gitignore` explicitly allows reviewed public documentation while leaving unrelated local notes ignored; do not unignore the entire directory.

Do not commit keys, `.env`, real response logs, private endpoints or screenshots of live credentials. Ordinary test history stays in memory: the frontend clears history from every private-state write and does not restore it, even though compatibility fields remain in the server schema.

Provider/model defaults are edited in `web/public/presets.json`; keep display labels and request IDs distinct. Catalog sync only changes the candidate snapshot. Selecting a catalog model preserves the active connection and must not silently persist provider presets or start a test.

CI on `main` pushes and pull requests runs `npm ci`, `npm run audit:prod`, and `npm run verify`. Browser suites and screenshot capture are separate local commands, not currently CI steps. The production audit excludes development dependencies; use `npm audit` for the full tree.

`@vercel/blob` is pinned in `package.json`. Before changing the pin, rerun the audit and Blob read/overwrite tests rather than assuming any version is indefinitely vulnerability-free. Fixed-path Blob writes use `allowOverwrite: true`. The Docker workflow runs on manual dispatch or `v*` tags, not ordinary `main` pushes; its current build target is `linux/amd64`.
