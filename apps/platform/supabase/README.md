# Supabase foundation

Production target region: **London (eu-west-2)** when the project is provisioned.

## Migrations

Committed SQL under `migrations/` (Phase 2 identity + Phase 3 RI). Apply via controlled pipeline or local verification — see **`docs/LOCAL-DATABASE.md`**.

## Local development

- `config.toml` — Supabase CLI scaffold (requires Docker for `supabase start`)
- Phase 3A acceptance uses embedded PostgreSQL when Docker is unavailable (`npm run test:acceptance:phase3a`)

Do not link or migrate remote production projects from this repo.
