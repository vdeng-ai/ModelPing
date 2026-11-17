# Model catalog integration

[Documentation](./README.md) · [Model-selection workflow](./model-selection-workflow.md)

The global catalog is a discovery source inside **Test**. The searchable model picker combines configured models and cached catalog entries; a separate **Global model catalog** dialog handles browsing, refresh and import. It is not a separate navigation page or part of the provider editor.

## Runtime availability

The current [Worker entry](../src/worker.ts) constructs `catalogStore` from `SETTINGS_KV` with the `model-catalog` key. It reuses the existing namespace; no additional namespace or binding is required.

[Node/Vercel environment setup](../src/env.ts) does not currently construct `catalogStore`, even when presets/private-state persistence is available. Without a catalog store, GET returns HTTP 200 with `available: false`, `providers: []` and `updatedAt: null`; explicit sync returns HTTP 501. Local presets, custom IDs, provider model-list lookup and generation tests remain available. This is an implementation limitation, not a claim that those platforms cannot support catalogs.

## Manual-only behavior

- First interaction with the model picker or catalog dialog reads the cached snapshot. Page navigation alone does not load it. The browser API layer caches the response in memory for the current JavaScript session.
- Typing filters locally. Only **Check for model updates** requests the public [Models.dev](https://models.dev/) source. There is no cron job, polling or provider-key requirement for catalog discovery.
- The sync endpoint validates and normalizes the response before replacing the snapshot. Failed, malformed or empty upstream catalogs do not replace the previous snapshot.
- Selection and provider import are different actions. Picking a candidate uses its actual request ID and preserves the active provider, URL and API key. It does not run a test or persist a provider preset.
- Explicit import merges selected IDs into a chosen provider, skips duplicates, or creates a provider from its public metadata. Refresh never automatically deletes or overwrites provider presets.

The UI shares catalog state through [useModelCatalog](../web/components/useModelCatalog.ts), while [model-selection helpers](../web/lib/model-selection.ts) merge sources by request ID, rank exact matches first and bound the rendered result count. Display labels and request IDs are not interchangeable. Membership checks include every provider mapping for a shared model.

## API and storage

| Endpoint                       | Behavior                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `GET /api/model-catalog`       | Read the cached snapshot only; never fetch upstream                                     |
| `POST /api/model-catalog/sync` | Fetch `https://models.dev/api.json?type=all`, normalize metadata and store the snapshot |

Both endpoints use the existing API password middleware. Responses are `no-store`; the application-level cache is scoped to the current JS session. Explicit sync uses a 12-second upstream timeout. Implementation: [API routes](../src/app.ts), [normalization](../src/model-catalog.ts), [browser cache](../web/lib/api.ts).

## Protocol and availability caveats

A directory entry does not establish that a model is enabled for an account, endpoint, region or key. Use **Fetch models** to inspect a provider's reported list, then run a generation test for the selected ID. A listed model may still fail generation or permissions checks.

Actual request protocols follow [protocolsForProvider](../src/protocols.ts): native Anthropic/Gemini provider IDs select their corresponding protocols; custom connections use model-name heuristics; other named providers use OpenAI-compatible probes. The catalog source and its displayed protocol hint do not override the active connection. Gateways can expose a vendor's model through another protocol.

Deprecated/deleted catalog entries are excluded when identified by upstream metadata. Selected model IDs remain distinct from human-readable labels. When the catalog cannot be loaded, local choices remain available and retry is explicit.

## Verification

```bash
npm run verify
npm run test:workbench:browser
npm run docs:screenshots
```

The browser suite uses local mock catalog data and verifies no implicit sync, preserved credentials, actual request IDs, repeated-selection deduplication, shared-provider membership, keyboard/IME/touch interaction, and unavailable/empty-catalog recovery. Documentation screenshots also use seeded fixtures, including on the local capture server; they do not imply Node has persistent catalog support.
