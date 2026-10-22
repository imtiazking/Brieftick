# Regulatory Intelligence — production data model (Phase 3)

Database-only foundation for the RI lifecycle. UI, Ask RI, AI analysis, and live ingestion are **out of scope**.

## Lifecycle

```
Regulatory source → Publication → (org publication state / applicability)
  → Regulatory change → Impact assessment → Obligation
  → Policy / Risk / Control → Action → Evidence → Assurance / Findings
```

## Global vs organisation-scoped

| Scope | Tables |
| --- | --- |
| Global reference | `regulators`, `regulatory_sources`, `regulatory_publications` |
| Organisation | All other RI tables include `organisation_id` |

Stable catalogue keys: `REG-*`, `SRC-*` on `external_key`. Primary keys are UUIDs; human IDs (e.g. `OBL-…`) are optional `external_key` fields later.

## Obligation status taxonomy

Postgres enum `obligation_status` (mirrored in `lib/ri/enums.ts`):

| Group | Values |
| --- | --- |
| Pre-active | `DRAFT`, `IN_REVIEW` |
| Active | `OPEN`, `IN_PROGRESS`, `OVERDUE` |
| Terminal | `COMPLETE`, `HISTORIC`, `CLOSED` |

Reporting must use these groups — not legacy Design Lab “open” counting.

## Delete behaviour

| Relationship | ON DELETE |
| --- | --- |
| Catalogue → publication | `RESTRICT` |
| Publication → change / obligation | `RESTRICT` |
| Change → impact assessment | `RESTRICT` |
| Organisation → tenant rows | `CASCADE` (tenant teardown) |
| Join / link rows | `CASCADE` on link row; `RESTRICT` on lifecycle endpoints |

Avoid cascading deletion across the regulatory lifecycle.

## Relationship authority

See [RELATIONSHIP-AUTHORITY.md](./RELATIONSHIP-AUTHORITY.md). Join tables are authoritative; graph traversal is not.

## Reference data seed

From repository root (after migrations applied locally):

```bash
node apps/platform/scripts/sync-reference-catalogue.mjs
# writes supabase/seed/reference-catalogue.generated.sql — apply with psql when ready
```

Sources remain `production_status = NOT_ENABLED` in catalogue integration metadata; the sync script does not enable production ingestion.

## RLS

All organisation-scoped tables: policies require `is_active_member(organisation_id)`. Global tables: `SELECT` for authenticated Clerk users only; writes via service role / migrations.
