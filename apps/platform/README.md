# FORGENIQ Platform (`app.forgeniq.com`)

Production authenticated application shell (Next.js App Router). One app, multiple product routes (`/ri`, `/fc`, `/or`, `/mi` — only `/ri` is scaffolded in Phase 1).

## Stack

- **Next.js** (App Router) + TypeScript
- **Clerk** — sole identity provider (no Supabase Auth)
- **Supabase** — PostgreSQL + Storage foundation (migrations prepared; no RI business schema yet)

## Authentication

Configure Clerk via `.env` (see `.env.example`). When keys are absent, middleware allows local builds without pretending production auth is enabled.

**Clerk → Supabase (future RLS):** use Clerk’s supported third-party JWT integration with Supabase — configure the JWT issuer in Supabase and session claims in Clerk. Do **not** use deprecated Clerk JWT templates or shared JWT secrets. Service-role keys stay server-only (`lib/supabase/admin.ts`).

## Supabase

- Browser: `lib/supabase/client.ts` (anon key only)
- Server: `lib/supabase/server.ts` (SSR cookie client + Clerk bearer JWT)
- Admin: `lib/supabase/admin.ts` (`server-only`, service role)

## Tenancy (Phase 2)

Organisations, memberships, platform roles, and RLS are defined in `supabase/migrations/`. See **`docs/TENANCY.md`** for Clerk → Supabase → RLS flow and future `organisation_id` on RI tables.

Do not run migrations against production from this repo without an explicit runbook. Local CLI:

```bash
cd apps/platform
npx supabase init   # when ready — not required for foundation build
```

Migrations live under `supabase/migrations/` (empty scaffold).

## Reference data

Server routes may read `packages/reference-data` for catalogue metadata only. Regulatory connectors and ingestion remain in `integrations/regulatory-sources` and are **not** invoked from the browser.

## Commands

```bash
cd apps/platform
npm install
npm run typecheck
npm run lint
npm run build
npm run test:acceptance
npm run dev   # http://localhost:3001
```

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Platform home (authenticated when Clerk configured) |
| `/ri` | Regulatory Intelligence placeholder |
| `/health` | Public health metadata (no secrets) |
| `/sign-in` | Clerk sign-in |
