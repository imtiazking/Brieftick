# Local database verification (Phase 3A)

## Preferred: Supabase CLI + Docker

When Docker Desktop is available:

```bash
cd apps/platform
npx supabase start
npx supabase db reset   # applies supabase/migrations only
npm run sync:reference-catalogue
# apply supabase/seed/reference-catalogue.generated.sql via psql to local DB URL from supabase status
```

Configure Clerk third-party JWT in local Supabase when testing PostgREST clients. Do **not** link or migrate remote production projects.

## Fallback: embedded PostgreSQL (this machine)

If Docker is unavailable, Phase 3A uses `embedded-postgres` (PostgreSQL 18.x bundle) plus `scripts/local-db/auth-jwt-shim.sql` to simulate `auth.jwt() ->> 'sub'` for RLS tests.

```bash
cd apps/platform
npm run test:acceptance:phase3a
```

The harness:

- wipes `apps/platform/.local-pg-verify/` (gitignored)
- applies shim + all committed migrations in order
- seeds reference catalogue SQL
- runs live RLS, relationship, taxonomy, and delete/provenance checks twice (reproducibility)

Ephemeral postgres password is generated per run and never written to disk.

## Obligation reporting groups (production)

| Group | Statuses |
| --- | --- |
| DRAFT (pre-active) | `DRAFT`, `IN_REVIEW` |
| ACTIVE | `OPEN`, `IN_PROGRESS`, `OVERDUE` |
| CLOSED (terminal) | `COMPLETE`, `HISTORIC`, `CLOSED` |

`OVERDUE` is an explicit lifecycle status — not inferred from ambiguous “open” counts.
