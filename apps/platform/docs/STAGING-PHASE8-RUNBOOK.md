# FORGENIQ RI — Phase 8 staging runbook

**Target:** `https://staging-app.forgeniq.com/ri`  
**App root:** `apps/platform` (separate Vercel project from `www.forgeniq.com` / `brieftick`)  
**Supabase staging:** `forgeniq-ri-staging` — ref `lhgzdicffkhaaykzthep`, URL `https://lhgzdicffkhaaykzthep.supabase.co`, region `eu-west-2`.

**Phase 8 PASS** requires: hosted login, DB + catalogue, RLS tenant isolation, RI + Ask RI acceptance on staging — not only local golden master.

---

## 1. Verify golden master (local, no infra)

```bash
cd apps/platform
npm run typecheck
npm run test:acceptance:ri
```

Branch: `production/ri-golden-master`. Tag: `ri-production-golden-master-complete`.

---

## 2. Supabase staging — migrations (idempotent)

A legacy placeholder migration `20260322150100_ri_lifecycle_part1` may exist without full DDL. The staging script **re-applies** lifecycle when preflight fails (missing `regulatory_changes`, etc.).

### Option A — Management API (recommended)

1. Create a personal access token: [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens) (do not paste into chat).
2. In a local terminal (PowerShell):

```powershell
cd apps\platform
$env:SUPABASE_PROJECT_REF = "lhgzdicffkhaaykzthep"
$env:SUPABASE_ACCESS_TOKEN = "<your token>"
npm run staging:apply-migrations
npm run staging:apply-catalogue
npm run staging:verify-db
```

Dry-run: `node scripts/staging/apply-supabase-migrations.mjs --dry-run`

### Option B — Supabase SQL editor

Run files in order from `apps/platform/supabase/migrations/`, then lifecycle splits from `scripts/staging/_lifecycle_part1.sql` and `_lifecycle_part2.sql` (generate with `node scripts/staging/ensure-lifecycle-split.mjs`).

### Reference catalogue

```bash
npm run sync:reference-catalogue
npm run staging:apply-catalogue
```

Expect **36 regulators** and **41 sources** (`staging:verify-db` or `staging:verify-catalogue` with `SUPABASE_ACCESS_TOKEN`).

### Clerk third-party auth (staging only)

1. [Supabase Dashboard](https://supabase.com/dashboard/project/lhgzdicffkhaaykzthep) → **Authentication** → **Sign In / Up** → **Third-party auth**.
2. Add **Clerk** using your **staging** Clerk app (JWKS). Do not use deprecated JWT templates.
3. Do not change production Supabase or www Clerk.

---

## 3. Vercel — `forgeniq-platform-staging`

Create a **new** project (do not reuse root `brieftick` / www).

| Setting | Value |
|--------|--------|
| Import repo | `imtiazking/Brieftick` (or your fork) |
| Root directory | `apps/platform` |
| Production branch | `production/ri-golden-master` |
| Framework | Next.js (see `vercel.json`, region `lhr1`) |

### Environment variables (Production + Preview for staging host)

Set in **Project → Settings → Environment Variables** (never commit values):

| Variable | Notes |
|----------|--------|
| `FORGENIQ_ENV` | `staging` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Staging Clerk app |
| `CLERK_SECRET_KEY` | Server only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/ri` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/ri` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lhgzdicffkhaaykzthep.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key (API settings) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |

Deploy after env is set. Note the `*.vercel.app` URL for Clerk allowlists until DNS is live.

### DNS

**Vercel:** Project → **Settings → Domains** → add `staging-app.forgeniq.com`.  
**DNS (your registrar):** CNAME `staging-app` → value Vercel shows (often `cname.vercel-dns.com`).

---

## 4. Clerk — staging application

Use a **separate** Clerk application from production www.

1. [Clerk Dashboard](https://dashboard.clerk.com) → create or select **FORGENIQ Platform Staging**.
2. **Configure → Domains:** add `staging-app.forgeniq.com` and your Vercel preview host if needed.
3. **Paths:** sign-in `/sign-in`; after sign-in redirect `/ri` (match env vars above).
4. **Allowed redirect URLs:**  
   `https://staging-app.forgeniq.com/sign-in`  
   `https://staging-app.forgeniq.com/ri`  
   plus `https://<project>.vercel.app/sign-in` and `/ri` for previews.
5. Copy **publishable** and **secret** keys into Vercel (section 3).

---

## 5. OWNER account and tenancy

1. Open `https://staging-app.forgeniq.com/sign-in` (or Vercel URL) and complete **one** sign-up / sign-in.
2. Clerk Dashboard → **Users** → copy your `user_…` id.
3. Bootstrap org + OWNER membership:

```powershell
cd apps\platform
$env:STAGING_CLERK_USER_ID = "user_xxxx"
node scripts/staging/bootstrap-staging.mjs --sql-only
```

Run printed SQL in Supabase **SQL Editor**, or with DB URL:

```powershell
$env:DATABASE_URL = "<staging connection string from Supabase Database settings>"
node scripts/staging/bootstrap-staging.mjs
```

4. Sign in again; confirm active organisation resolves to the bootstrapped org.

---

## 6. Smoke and acceptance (staging)

```powershell
$env:STAGING_APP_URL = "https://staging-app.forgeniq.com"
npm run staging:smoke
```

| Check | Action |
|-------|--------|
| Health | `/health` |
| RI hub | `/ri` |
| Ask RI | `/ri/ask` — submit a question |
| AI | `/ri/ai`, `/ri/ai-governance` |
| RLS | Second Clerk user must not see OWNER org tenant rows |
| Catalogue | Regulators/sources visible when authenticated |

Re-run local gates against staging-backed env when appropriate: `npm run test:acceptance:ri`, `npm run test:acceptance:phase7c7`.

---

## 7. What not to touch

- `www.forgeniq.com` (root repo / `brieftick` Vercel project) and Market Intelligence
- Production Clerk, production Supabase, Design Lab golden tags/commits
- Do not merge `production/ri-golden-master` into `main` until Phase 8 PASS sign-off

---

## 8. Migration manifest (canonical order)

See `scripts/staging/migration-manifest.mjs`. Lifecycle uses split files generated by `ensure-lifecycle-split.mjs` from `20260322150100_ri_lifecycle.sql`.
