# Organisation tenancy & RLS

## Model

| Table | Purpose |
|-------|---------|
| `organisations` | Tenant boundary (`id` UUID, `name`, `slug`, `status`) |
| `organisation_memberships` | Clerk user ↔ organisation with `platform_role` |

Canonical identity: **Clerk user ID** (`clerk_user_id`). No Supabase Auth users, no duplicated passwords.

## Roles

`OWNER`, `ADMIN`, `COMPLIANCE_MANAGER`, `ANALYST`, `REVIEWER`, `VIEWER` — defined in `lib/roles.ts` and Postgres enum `platform_role`.

- **ADMIN** cannot assign **OWNER** to others (RLS + `canAssignRole`).
- Privilege checks run server-side (`requireRole`, `requireOrganisation`).

## Active organisation

- Cookie: `forgeniq_active_org` (httpOnly UUID).
- Set only via `POST /api/organisation/active` after membership validation.
- Never trust browser-supplied organisation id without membership proof (`tenant-access.ts`).

## Clerk → Supabase → RLS

1. User signs in with **Clerk** (sole IdP).
2. Server Supabase client (`lib/supabase/server.ts`) sends Clerk session JWT as `Authorization: Bearer <token>` (no deprecated JWT templates).
3. Supabase validates JWT using **Clerk third-party auth** configuration (dashboard: connect Clerk, JWKS).
4. RLS uses `auth.jwt() ->> 'sub'` via `current_clerk_user_id()`.
5. Policies on `organisations` / `organisation_memberships` enforce tenant isolation.

Service-role (`lib/supabase/admin.ts`) is **server-only** and not used for normal user reads/writes.

## Future RI data

Organisation-scoped RI tables will include `organisation_id` (obligations, changes, assessments, evidence, AI analyses, etc.).

Global reference data stays outside tenant ownership: regulators, regulatory sources, sectors, frameworks (`packages/reference-data`).

## Local testing

- Without Clerk/Supabase credentials: app builds; membership APIs return empty; RLS validated via migration SQL + deterministic tests in `scripts/acceptance-phase-2-tenant-isolation.mjs`.
- With credentials: run migrations locally (`supabase db reset` / `migration up`) — **not** against production in this repo workflow.

## Organisation provisioning (Phase 8+)

- **Tenant reads/writes** require an active `organisation_memberships` row (RLS).
- **Creating organisations or bootstrap OWNER rows** is not permitted via the anon/authenticated Supabase API after `20261025100000_phase8_security_hardening.sql`.
- Use **service-role** server jobs or SQL bootstrap (`staging:bootstrap-ri-owner --sql-only`) for controlled provisioning.

## Platform operators vs tenant roles

| Layer | Mechanism |
|-------|-----------|
| **Tenant** (`OWNER` … `VIEWER`) | `organisation_memberships` + `is_active_member(organisation_id)` |
| **FORGENIQ platform operator** | `platform_operators` allowlist + `is_platform_operator()` — global ingestion/ops only |

Customer org `COMPLIANCE_MANAGER` / `OWNER` does **not** imply platform-operator access.

Bootstrap: `scripts/staging/bootstrap-platform-operator.mjs --sql-only` (after security migration).

## Ingestion operations RLS

- **Global catalogue** (`regulators`, `regulatory_sources`, `regulatory_publications`): any signed-in Clerk user.
- **Platform ops** (`ingestion_runs`, alerts, `regulatory_source_operations`, etc.): **`is_platform_operator()`** only.
- **`notification_events` INSERT**: platform operator, or tenant AI events with `payload.organisation_id` + `AI_%` event type.

## Production migrations (later)

Apply committed files under `supabase/migrations/` through your controlled Supabase pipeline after review. Do not edit schema in the dashboard.
