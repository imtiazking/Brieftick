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
2. Add **Clerk** using the **same** Clerk application as www (`clerk.forgeniq.com`). Do not use deprecated JWT templates.
3. Do not change **production** Supabase. Do not remove www redirect URLs from Clerk.

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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Same** Clerk application as www (`clerk.forgeniq.com`) |
| `CLERK_SECRET_KEY` | Server only — same Clerk app secret as production www |
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

## 4. Clerk — reuse existing FORGENIQ application

Use the **same** Clerk application already used for www/MI (`clerk.forgeniq.com`). Do **not** create a second Clerk application unless Clerk reports a hard limitation (e.g. domain/satellite limits).

### Safe multi-host pattern

| Host | Role |
|------|------|
| `www.forgeniq.com` | MI / marketing (unchanged) |
| `staging-app.forgeniq.com` | RI platform staging (`apps/platform`) |

**Clerk Dashboard** (existing FORGENIQ app):

1. **Domains** → add **`staging-app.forgeniq.com`** as an additional domain (or satellite) on the **production** instance used by www.
2. **Paths:** sign-in `/sign-in`; after sign-in `/ri` (set Vercel env vars in section 3).
3. **Allowed redirect URLs** (add, do not remove www URLs):  
   `https://staging-app.forgeniq.com/sign-in`  
   `https://staging-app.forgeniq.com/ri`  
   `https://<forgeniq-platform-staging>.vercel.app/sign-in`  
   `https://<forgeniq-platform-staging>.vercel.app/ri`
4. Copy the **same** publishable + secret keys already used for www into the **new Vercel project only** (section 3). Staging Supabase is separate; www production database is not used.

### MI test accounts (do not change)

Preserve these Clerk users for MI — **no** `organisation_memberships` rows for them on RI staging unless you explicitly add them later:

- `imtiazahmed_@hotmail.com`
- `imtiazahmed77@icloud.com`

RI isolation is enforced by Supabase: no membership → `requireOrganisation()` fails → RI dashboard shows “Sign in and select an organisation”.

---

## 5. RI OWNER account and tenancy

Use a **dedicated** Clerk user for RI staging (new email — **not** the MI test accounts above).

1. Open `https://staging-app.forgeniq.com/sign-in` (or Vercel URL) and **sign up** the RI staging user once.
2. Clerk Dashboard → **Users** → copy that user’s `user_…` id.
3. Bootstrap FORGENIQ org + OWNER membership (staging Supabase only):

```powershell
cd apps\platform
$env:STAGING_CLERK_USER_ID = "user_xxxx"
npm run staging:bootstrap-ri-owner -- --sql-only
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

### Empty `phase8a_reference_catalogue_seed` row (fixed)

An accidental MCP `apply_migration` with placeholder SQL was recorded as version `20261023113615`. Catalogue data was applied via idempotent `execute_sql` upserts, not that migration. **Safe fix applied on staging:** the placeholder row was removed from `supabase_migrations.schema_migrations` (no DDL had been applied). Do not re-add unless you ship a real migration file in `supabase/migrations/`.

---

## 9. Phase 8B — hosted deploy checklist (your account)

**Phase 8 PASS** is blocked until hosted acceptance passes (section 6).

| Step | Owner | Status |
|------|--------|--------|
| Push `production/ri-golden-master` (includes Phase 8A scripts) | Agent | Done — push to `origin` |
| Create Vercel project `forgeniq-platform-staging` (steps below) | You (team **Owner** or **Member** with create-project) | **Required** — agent MCP returned **403**; local CLI needs `vercel login` |
| Set Vercel env vars (see section 3) | You | **Required** |
| Add domain `staging-app.forgeniq.com` to **platform** project (not `brieftick`) | You | **Required** — today only `www` / apex on `brieftick` |
| Clerk: add `staging-app` domain + redirect URLs (same app as www) | You | **Required** |
| RI OWNER: new Clerk user + `staging:bootstrap-ri-owner` | You | After deploy |
| Supabase staging → Clerk third-party auth (same Clerk app as www) | You | **Required** |
| `STAGING_BASE_URL=… npm run staging:smoke` + hosted RI/Ask RI checks | Agent/you | After deploy |

Do **not** attach `staging-app` to the root `brieftick` project (that serves `www.forgeniq.com` / MI).

### Create `forgeniq-platform-staging` in Vercel (dashboard)

1. [vercel.com/new](https://vercel.com/new) → **Import** `imtiazking/Brieftick`.
2. **Project name:** `forgeniq-platform-staging`.
3. **Root Directory:** `apps/platform` (Edit → set before first deploy).
4. **Production Branch:** `production/ri-golden-master` (Settings → Git).
5. **Environment variables:** section 3 (use existing Clerk keys from www; staging Supabase URL/keys only).
6. Deploy → copy `https://forgeniq-platform-staging.vercel.app` for Clerk allowlists.
7. **Settings → Domains** → add `staging-app.forgeniq.com`.
8. **GoDaddy/registrar:** CNAME `staging-app` → target Vercel shows (often `cname.vercel-dns.com`).

### Supabase ↔ Clerk (staging project `lhgzdicffkhaaykzthep`)

1. Clerk Dashboard → **Configure** → **JWT templates** is **not** used (deprecated path).
2. Supabase Dashboard → **Authentication** → **Sign In / Up** → **Third-party auth** → **Clerk** → connect the **same** Clerk application (JWKS).
3. Confirm RLS still uses `auth.jwt() ->> 'sub'` (already migrated).
