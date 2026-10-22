# RI ingestion map (Phase 6)

| Catalogue `SRC-*` | Connector (`integrations/regulatory-sources`) | Normalised document | `regulatory_publications` |
| --- | --- | --- | --- |
| Eligible sources (e.g. `SRC-PSR-UK-RULES`) | `batch-1-registry` / `batch-1b` / `batch-2` connector `verify()` | `lib/ri/ingestion/adapter.mjs` | Upsert via `ingest-engine.mjs` with version rows |

Eligibility: `coverageVerificationStatus === COVERAGE_VERIFIED`, not `SANCTIONS_DATA`, `ingestion_mode` not `DISABLED`, content gating via `packages/reference-data/catalogue/source-content-gating.mjs`.

Stable `REG-*` / `SRC-*` resolve to UUIDs in `regulators` / `regulatory_sources` (reference seed). Duplicate detection: `(source_id, external_document_id)` and `(source_id, canonical_url)`. Version history: `regulatory_publication_versions`.

Manual CLI: `npm run ri:ingest -- --source SRC-... --fixture` with `FORGENIQ_LOCAL_PG_URL`. Admin UI: `/ri/admin/sources`, `/ri/admin/ingestion`.
