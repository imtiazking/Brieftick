# STAGING_DATABASE_URL local execution blocker (resolved path)

## Root cause

| Item | Finding |
|------|---------|
| `.env.staging.pull` | `STAGING_DATABASE_URL` is a **Vercel non-pullable placeholder** (not a `postgresql://` URL). |
| `.env.uat-secrets.local` | Same pattern (`@base` / short placeholder) — triggers `ENOTFOUND base` when used with `pg`. |
| `vercel env pull` | **24 production secrets** cannot be downloaded; placeholders are retained by design. |
| `vercel env run` (PowerShell) | Injects only **non-secret** vars locally; `STAGING_DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` remain unavailable on the agent machine. |

## Authorised execution paths (no credential export)

1. **Hosted staging** — `POST /api/internal/ri-ingestion/corpus-snapshot-tick` (CRON_SECRET, same auth model as scheduler). Runs with full Vercel production env on `forgeniq-platform-staging`.
2. **Supabase MCP `execute_sql`** — read-only inventory and coverage tallies on `forgeniq-ri-staging` (`lhgzdicffkhaaykzthep`).
3. **Hosted scheduler** — `POST /api/internal/ri-ingestion/scheduler-tick` (ingest metadata; snapshot policy now widened for HTML evidence on approved connectors).
4. **Operator local backfill** — only when a **valid** `STAGING_DATABASE_URL` is placed in a **local-only** file (not committed); scripts: `regulatory-knowledge-foundation-inventory.mjs`, `tranche-g-rederive-from-snapshots.mjs`.

## Operator action (optional, not required for hosted corpus ticks)

Paste the approved staging Postgres URL into `apps/platform/.env.uat-secrets.local` or use `apps/platform/.vercel/staging-production.env` from an authorised `vercel env pull` session that includes DB secrets (requires Vercel secret export permission).

## Corpus population default

Use `apps/platform/scripts/staging/hosted-corpus-snapshot-tick.mjs` and `tranche-g-corpus-backfill-loop.mjs` after deploying the corpus tick route.