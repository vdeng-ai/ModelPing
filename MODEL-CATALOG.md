# Model Catalog

ModelPing's unified provider library includes an optional global model catalog sourced from [Models.dev](https://models.dev/). The catalog is integrated into the provider list rather than being a separate workspace page.

## Manual-only behavior

- Opening the provider settings reads the last snapshot from the existing `SETTINGS_KV` namespace (`model-catalog` key).
- The browser keeps that snapshot in memory for the current page session, so navigating away and back does not repeat the KV read.
- External catalog requests happen only after the user clicks **Check for model updates**.
- There is no Cron Trigger, scheduled refresh, background polling, or provider API-key requirement for catalog discovery.
- The sync endpoint validates and normalizes the external response before storing one JSON snapshot. Failed or malformed upstream responses do not replace the previous snapshot.
- Adding models is a separate explicit action. It merges selected IDs into the chosen existing provider preset, skips duplicate IDs, and uses the existing settings persistence flow.
- A catalog provider can also be created directly as a new provider preset using its public base URL and documentation link.
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

## Primary user journey

1. Decode a key or base URL in the local Toolbox.
2. Use the decoded-value action to transfer it into the connection form (no clipboard round trip).
3. Select a saved provider or use a custom-compatible endpoint, then fetch models or select a preset model.
4. Run the connectivity test.
5. Add a successful endpoint/model to Status for manual or opt-in automatic monitoring.
