# FORGENIQ global regulatory reference data

Authoritative **catalogue-only** layer for production platform connectors (no live HTTP, no ingestion).

- **Regulators:** `catalogue/regulators.mjs`
- **Sources:** `catalogue/regulatory-sources.mjs`

Stable IDs (`REG-*`, `SRC-*`) are referenced by future provider connectors and ingestion runs.

Design Lab (`design-lab/regulatory-intelligence/`) remains frozen; verified UK/international identities align with Design Lab verification artifacts where noted in source `notes`.

Validate: `node packages/reference-data/scripts/acceptance-global-source-catalogue.mjs`

## Integration verification (separate from catalogue lifecycle)

Batch 1 / 1B lab results are reconciled in `catalogue/source-integration.mjs` and attached to each source as `integration`:

- `verificationStatus` — Integration Lab outcome (`LIVE_VERIFIED`, `ACCESS_RESTRICTED`, `NOT_TESTED`, …)
- `productionStatus` — connector enablement (`NOT_ENABLED` for all lab-verified sources)
- `productionStrategy` — future ingestion approach
- Evidence refs point at **tracked** `integrations/regulatory-sources/manifests/*-verification.json` (fingerprints + URLs only)
- Optional local raw runs remain under `integrations/regulatory-sources/evidence/` (gitignored)
