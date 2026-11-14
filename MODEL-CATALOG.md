# Model Catalog

ModelPing's provider settings include an optional global model catalog sourced from [Models.dev](https://models.dev/).

## Manual-only behavior

- Opening the provider settings reads the last snapshot from the existing `SETTINGS_KV` namespace (`model-catalog` key).
- The browser keeps that snapshot in memory for the current page session, so navigating away and back does not repeat the KV read.
- External catalog requests happen only after the user clicks **Check for model updates**.
- There is no Cron Trigger, scheduled refresh, background polling, or provider API-key requirement for catalog discovery.
- The sync endpoint validates and normalizes the external response before storing one JSON snapshot. Failed or malformed upstream responses do not replace the previous snapshot.
- Adding models is a separate explicit action. It merges selected IDs into the chosen existing provider preset, skips duplicate IDs, and uses the existing settings persistence flow.
- Existing models are never deleted or overwritten by catalog sync. The catalog is advisory; use the provider's **Fetch models** action to check what a specific API key can actually access.

## Cloudflare storage and endpoints

The Worker reuses `SETTINGS_KV` with a separate key, so no new KV namespace or binding is required.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/model-catalog` | Read the cached snapshot; does not contact upstream sources |
| `POST /api/model-catalog/sync` | Fetch `https://models.dev/api.json?type=all`, normalize provider/model metadata, and write the snapshot |

Both endpoints are covered by the existing `APP_PASSWORD` API middleware. The GET response is `no-store`; browser memory caching is scoped to the current JS session. Sync is user-triggered and uses a 12-second upstream timeout.

## Data caveats

Models.dev is a community-maintained public catalog, not a guarantee that a model is enabled for a particular account, region, endpoint, or API key. Model IDs and labels are preserved separately. Deprecated/deleted entries are excluded where the upstream metadata identifies them. Provider API discovery remains the final availability check.

## Verification

```bash
npm run verify
npm run test:workbench:browser
```
