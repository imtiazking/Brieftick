# Vercel Hobby resource audit — 2026-11-23

**Team:** `imis-projects-8e15dca0` (imi's projects)  
**Dashboard context:** Fluid Active CPU ~3h07m / 4h; ~333k function invocations; deployment storage ~8.32 GB / 10 GB; ~53 min CPU remaining.

> **Evidence limits:** Team-level Observability MCP returned **403** on this Hobby account; per-project runtime log aggregation also **403** for `prj_y9O1A1zGFXe3GvJITnLL9mJUqve7`. Route-level CPU splits are therefore **not available** from the API. Attribution below uses **supported CLI facts** (project list, deployment cadence, sampled logs) and **documented application behaviour** — not guessed percentages for non-FORGENIQ projects.

## 1. CPU and invocations by project (supported facts)

| Project | Production URL | Last prod deploy (CLI) | Notes |
|---------|----------------|------------------------|--------|
| **forgeniq-platform-staging** | staging-app.forgeniq.com | **2026-11-23 ~20:07 UTC** (frequent same-day deploys) | FORGENIQ RI lab + `/api/ri-lab/*` |
| **platform** | platform-*.vercel.app | ~13h ago; recent deploys **Error** | Legacy / alternate platform app |
| **brieftick** | www.forgeniq.com (prod) | **~5 days ago** | Customer marketing site — **do not modify** |
| worldcup-family-sweep, leadcrest-website-v3 | old | weeks–months | Low current activity (CLI) |

### FORGENIQ staging — high-confidence drivers (2026-11-23)

1. **Repeated production-target staging deploys** — CLI shows **40+** `forgeniq-platform-staging` deployments in the last ~7h (pilot: suffix env merges, spend-cap patch, failed builds). Each build ~2–3 min → major **Fluid Active CPU** and **deployment storage** growth.
2. **UC-RI-005 AI extraction** — `POST /api/ri-lab/ai-analysis-runs` runs up to **300s** (`vercel.json` `maxDuration`). Sampled log: single batch **~82s** provider time, **8192** output tokens (`dpl_AvAyBqSSYsn2FbRcV5CbyJYsPoQU`).
3. **UAT polling** — Playwright scripts polled run status every **4s** until terminal (up to 360s) → **~15–90 GETs per run**; pilot ran multiple batches + spend reconcile (12+ sequential GETs per reconcile).
4. **Orchestration / batch-plan routes** — Each call could **download PDF evidence from Storage** and build blocks; `extraction-batch-plan` also called `buildPdfGroundedAnalysisContext` (second PDF pass) until optimisations below.
5. **Regulatory connector polling** — Design Lab documents **no production polling scheduler** (`productionPolling: false` in acceptance). **117 cron invocations** are **not** explained by FORGENIQ `vercel.json` (no `crons` in `apps/platform/vercel.json`); likely other team projects or Vercel platform crons — **unattributed**.

### brieftick / customer site

Production **brieftick** stale ~5d — **not** the primary driver of today's CPU spike. No changes made.

## 2. Top routes (inference from code paths + sample log only)

| Route | Role | Invocation pressure |
|-------|------|---------------------|
| `GET /api/ri-lab/ai-analysis-runs/[id]` | UAT poll loop | **Very high** during pilots |
| `POST /api/ri-lab/ai-analysis-runs` | Paid extraction | Low count, **very high CPU per call** |
| `GET/POST .../extraction-orchestration` | Pilot batches | Medium |
| `GET .../extraction-batch-plan` | Pre-flight (PDF + plan) | Medium; **CPU heavy** per call pre-fix |
| `GET /api/ri-lab/session`, catalogue bootstrap | Lab UI connect | Medium on human use |

## 3. Deployment storage (8.32 GB)

- **Cause:** Cumulative **archive (`--archive=tgz`) production deploys** to `forgeniq-platform-staging` without pruning. **40+** deploys visible in CLI default list; Hobby retains deployment artifacts per project.
- **Failed builds** still consume storage (`● Error` deploys in list).
- **NOT deleted** (requires your authorisation).

### Safe cleanup recommendations (operator action)

1. Vercel dashboard → **forgeniq-platform-staging** → Deployments → filter **Ready**; **keep** current production alias (`staging-app.forgeniq.com`), **last known good rollback** (`dpl_7T28te7MyhHBpcKL6jYv4yRD4aTj` or newer from evidence), and **pinned** pilot evidence deploys.
2. Bulk-delete **Error** and superseded **Ready** preview-less production deploys older than 7 days (same git binary).
3. Avoid **>1 staging deploy per logical change** — use `FORCE_STAGING_DEPLOY=1` only when env suffix or server code must go live together.
4. Do **not** prune **brieftick** production.

## 4. Optimisations implemented (code — not deployed to production brieftick)

| Change | File(s) | Estimated savings |
|--------|---------|-------------------|
| Exponential backoff polling (6s → 20s cap) | `scripts/uat/uat-poll-ai-run.mjs`, wired into PS22 continue + live-full extraction | **~35–45% fewer** poll GET invocations per AI run |
| PDF evidence process cache (5 min, 8 entries) | `load-publication-pdf-evidence.mjs` | **~40–60%** PDF Storage/CPU on repeated orch/plan calls per warm instance |
| `extraction-batch-plan`: grounding sample **opt-in** (`includeGroundingSample=true`) | `extraction-batch-plan/route.ts` | **~1× PDF load removed** per default plan request |
| Terminal run GET `Cache-Control: private, max-age=30` | `ai-analysis-runs/[id]/route.ts` | Marginal on Playwright; helps browser/repeat reads |
| Parallel spend reconcile (4-wide) | `pilot-spend-reconcile-staging.mjs` | **~3× faster** reconcile, same invocation count |
| Staging deploy throttle (15 min default) | `phase85h-deploy-staging-platform.mjs` | Prevents accidental **6+ deploy marathons**/session |

**No in-flight paid AI jobs interrupted.** No brieftick deploy. Staging deploy of these optimisations **deferred** until CPU headroom or explicit deploy — local testing preferred.

## 5. Further UAT on free allowance?

**Tight.** ~53 min CPU remaining on a reset cycle that already absorbed:

- ~7h of staging **build/deploy** activity,
- Multiple **82s+** extraction functions,
- Hundreds of thousands of **lightweight GETs** from polling.

**Recommendation:**

- **Pause hosted PS22 pilot drain** until next billing/CPU reset (or after deployment cleanup + single deploy).
- Run **acceptance locally** against `next dev` where possible.
- When resuming hosted UAT: **one deploy** per change set, use backoff polling (already in repo), set `SKIP_SUFFIX_MERGE=1` when suffixes pre-merged, run `pilot-spend-reconcile` only before/after paid batches (not inside loops).

## 6. Production protection

- **brieftick / www.forgeniq.com:** untouched.
- **forgeniq-platform-staging only** target for future optimisations deploy.