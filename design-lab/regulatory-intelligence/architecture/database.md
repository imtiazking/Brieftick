# Database architecture

## Recommendation

**PostgreSQL** as the primary transactional store.

## Rationale

- Relational traceability (change → obligation → control → evidence)
- ACID transactions for approvals, closure, audit + workflow updates
- Mature indexing, JSONB for extensible metadata
- Strong consistency for governance and assurance opinions
- Reporting queries and read models without immediate warehouse

## Keys

- Internal primary keys: **UUID or ULID**
- Business references: `CHG-001`, `IA-0042` (unique per tenant, not sole PK)

## Concurrency

- `row_version` (optimistic locking) on mutable aggregates
- `409 Conflict` / `STALE_VERSION` on stale commands

## Tenancy

- `tenant_id` on operational rows
- Shared regulator catalogue may be global with tenant-specific publications/changes

## Design Lab

No database connected. Canonical shapes align with `postgres-schema.sql` and OpenAPI models.
