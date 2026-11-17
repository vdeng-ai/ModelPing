# Deployment, configuration and security

[Documentation](./README.md) · [简体中文](./deployment.zh-CN.md)

ModelPing forwards API credentials and requests to user-selected endpoints. Configure access control and storage before making an instance public. The commands below describe this repository's configuration, not guaranteed platform pricing or quotas.

## Choose a runtime

| Runtime            | Frontend/API                     | Presets and encrypted private state                              | Global catalog storage                          |
| ------------------ | -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Node / Docker      | One Node service                 | File driver by default                                           | Not wired up in the current Node entry          |
| Cloudflare Workers | Static Assets + Worker API       | `SETTINGS_KV`                                                    | Same KV namespace, separate `model-catalog` key |
| Vercel             | Static frontend + `api/index.ts` | Blob when `BLOB_READ_WRITE_TOKEN` is present; otherwise disabled | Not wired up in the current Vercel entry        |

Without catalog storage, configured models, custom IDs, model-list lookup and testing still work. Catalog GET returns an unavailable/empty snapshot; explicit sync returns HTTP 501. This is separate from provider-preset persistence. See [catalog integration](./model-catalog.md).

## Node

```bash
npm ci
npm run build
cp .env.example .env
# Fill APP_PASSWORD and a separate high-entropy PRIVATE_STATE_SECRET.
# Review target-host restrictions before starting a public instance.
node --env-file=.env dist/server/node.js
```

The default port is `8787`. `npm start` uses the same entry but expects environment variables to be supplied by the caller; it does not parse `.env`. Keep secrets out of shell history and Git. For normal development, see [development](./development.md).

The default presets file is `./web/public/presets.json`. Editing providers through the UI can update this file. For a separate runtime data directory, set `SETTINGS_FILE=./data/presets.json`; protect and back up the data directory. A missing presets file falls back to the bundled defaults. Encrypted private state defaults to `./data/private-state.enc`.

## Docker

The [Dockerfile](../Dockerfile) builds the frontend/backend and runs as the non-root `node` user. The [Compose file](../docker-compose.yml) includes the app and Watchtower.

Before starting, replace the Compose `image:` with the image/tag you actually published. The checked-in image name is not a guarantee that an image exists for your fork. Alternatively replace `image:` with `build: .` for a local build.

```bash
cp .env.example .env
# Set APP_PASSWORD and PRIVATE_STATE_SECRET; Compose requires both.
docker compose up -d
# With build: . instead of image:, use: docker compose up -d --build
```

The app exposes port `8787`. Presets use the named volume `presets-data` at `/data/presets.json`; encrypted private state uses the `./data` bind mount at `/app/data/private-state.enc`. Ensure the bind mount is writable by the container's `node` user. Configure HTTPS at your reverse proxy and restrict public access before exposing the port.

The [image-publishing workflow](../.github/workflows/docker-publish.yml) publishes to `ghcr.io/<owner>/<repository>` on manual dispatch or `v*` tags. Confirm the actual generated tag; do not assume every tag event updates `latest`. Make a package public or provide registry credentials before pulling it from another host. The current workflow builds `linux/amd64` only.

Watchtower checks labeled containers every 300 seconds and has access to the Docker socket. Remove that service when automatic image replacement is not wanted; update explicitly with `docker compose pull && docker compose up -d` instead. A normal `main` push does not publish a Docker image.

## Cloudflare Workers

[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/vdeng-ai/ModelPing)

Review the deployment wizard's resource bindings and secrets rather than treating a button as a security configuration. Use a KV namespace in your own account: the namespace ID checked into [wrangler.toml](../wrangler.toml) is not portable to a different account.

For CLI deployment:

```bash
npm ci
npx wrangler login
npx wrangler kv namespace create SETTINGS_KV
```

Replace the `id` in the existing binding block with the returned ID; do not append a duplicate binding:

```toml
[[kv_namespaces]]
binding = "SETTINGS_KV"
id = "<your-kv-namespace-id>"
```

Configure `APP_PASSWORD` and `PRIVATE_STATE_SECRET` as Worker secrets using the dashboard/deployment setup or Wrangler:

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put PRIVATE_STATE_SECRET
npm run deploy:cf
```

For a first deployment, Wrangler may require creating the Worker before setting its secrets. Keep routes/access restricted until both secrets are in place; never leave an unprotected forwarding proxy public. Do not put secret values in `wrangler.toml`.

The committed configuration uses `dist/client` as Static Assets, SPA fallback, and `run_worker_first = ["/api/*"]`. Only API routes are configured to run the Worker before assets. Its application defaults are `PRIVATE_STATE_SCOPE=config`, `DAILY_REQUEST_BUDGET=60000`, and `BLOCK_PRIVATE_HOSTS=1`. The request budget is a local soft estimate for Status auto-refresh, not an account-wide enforcement mechanism, live usage report, or guarantee of remaining quota.

For repository-connected Workers Builds, use production branch `main`, build command `npm run build:cf`, and deploy command `npx wrangler deploy`. Configure secrets/bindings for the target environment separately. Check your account's current Worker/KV limits and usage; this guide deliberately does not hard-code free-plan quotas.

## Vercel

Connect the repository as a Vercel project, or link it with the CLI:

```bash
npx vercel
# After configuration and verification:
npx vercel --prod
```

[vercel.json](../vercel.json) builds with `npm run build:vercel`, serves `dist/client`, and rewrites `/api/*` to the Node entry [api/index.ts](../api/index.ts). Set access controls and secrets in the project's environment settings before exposing production.

For persistence, configure Blob and provide `BLOB_READ_WRITE_TOKEN`. Without it, the Vercel entry defaults to `STORAGE_DRIVER=none`. The Blob driver uses fixed settings/private-state paths. Test overwrite behavior after SDK changes.

Check function duration, streaming and resource limits for your actual project configuration. The repository does not set `maxDuration`; the application's 30-second timeout cannot extend the hosting platform's execution allowance. Lower request timeouts or use a suitable runtime when long responses are interrupted.

## Environment variables

| Variable                | Meaning / repository default                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_PASSWORD`          | Access gate for protected APIs, supplied as `x-app-password`; do not confuse it with a provider API key. The health endpoint remains available for capability discovery. |
| `PRIVATE_STATE_SECRET`  | Dedicated high-entropy encryption secret; prefers the v2 encrypted-state format. Keep it separate from the access password.                                              |
| `STATUS_SECRET`         | Legacy encryption fallback; `APP_PASSWORD` is used if neither dedicated secret is set.                                                                                   |
| `PRIVATE_STATE_SCOPE`   | `full` (server default), `config`, or `none`. The current UI never persists/restores test history under any scope. `none` disables private-state persistence.            |
| `STORAGE_DRIVER`        | `file`, `cf-kv`, `vercel`, or `none`. Worker entry supports only `cf-kv`/`none`; runtime detection otherwise follows the table above.                                    |
| `SETTINGS_FILE`         | File-driver preset path; defaults to `./web/public/presets.json`.                                                                                                        |
| `PRIVATE_STATE_FILE`    | File-driver ciphertext path; defaults to `./data/private-state.enc`.                                                                                                     |
| `BLOB_READ_WRITE_TOKEN` | Credentials for the Vercel Blob store.                                                                                                                                   |
| `ALLOWED_HOSTS`         | Optional comma-separated target-host allowlist; unset means no allowlist.                                                                                                |
| `BLOCK_PRIVATE_HOSTS`   | `1` enables the implemented private-address guard. Default off in the shared API, enabled in `wrangler.toml`.                                                            |
| `CORS_ORIGIN`           | Explicit allowed cross-site origins, comma-separated; unset sends no cross-origin ACAO header. Avoid `*` for a credential-handling instance.                             |
| `DAILY_REQUEST_BUDGET`  | Status auto-refresh daily soft budget; committed Worker value is `60000`. Not a provider-token spending limit.                                                           |
| `PORT`                  | Node listen port, default `8787`.                                                                                                                                        |

`SETTINGS_KV` is a Worker binding, not a plain-text environment variable. Node uses process environment values; Docker Compose reads its `.env`; Worker and Vercel secrets belong to their respective environment configuration. See [.env.example](../.env.example), [environment injection](../src/env.ts), and [Worker entry](../src/worker.ts).

## Storage and privacy

Provider presets contain endpoints/model IDs, not API keys, and may be cached in the browser. Treat them as non-secret configuration. When a suitable store and encryption secret are available, the last connection, parameters, saved custom model IDs and Status entries can be saved as encrypted private state. Connection and Status entries can include API keys.

The current frontend keeps test history in memory and strips it from every private-state write, regardless of `PRIVATE_STATE_SCOPE=full`. Compatibility fields in the backend schema do not re-enable history persistence. Legacy sensitive browser-storage values are migrated/removed; theme/language and non-sensitive preferences remain local.

Decoder input/output and JWT signing secrets stay in browser memory. Transferring decoded output to the connection form makes it connection state, so it can then be encrypted and saved. Network tests and lookups necessarily pass credentials through the backend to the selected provider. Storage encryption does not make a malicious instance trustworthy.

Instances use shared storage paths, not per-user tenants. Do not share one instance among mutually untrusted users. Back up ciphertext and encryption secrets securely; changing or losing the encryption secret can make saved data unreadable. History exports omit the explicit API-key field, not arbitrary sensitive content echoed in a response.

## Public deployment checklist

Use HTTPS and a strong access password. Restrict destinations with `ALLOWED_HOSTS` and/or network egress controls, and use the app's private-address guard as an additional layer. Review the bundled [egress firewall script](../deploy/firewall-egress.sh) against your environment before applying it; it changes host networking rules.

The private-address check is not comprehensive protection against DNS rebinding. CORS limits browser cross-origin access; it is not authentication and does not prevent direct non-browser calls. Never rely on either mechanism alone to protect an open proxy. Local/intranet testing requires a deliberately restricted deployment rather than disabling protections on a public instance.

Application failure logs include redaction, but upstream responses can still contain sensitive text. Inspect reverse-proxy/platform logging separately and do not add raw request-body or credential logging. Validate the instance's password gate, allowed destinations, storage behavior and representative requests before sharing it.
