# FORGENIQ RI — Staging verification report (19 Nov 2026)

Scope: staging `forgeniq-platform-staging` (staging-app.forgeniq.com), Supabase `lhgzdicffkhaaykzthep`.
Evidence labels: **[LIVE-RO]** read-only against live staging (HTTP / Vercel API / SQL SELECT),
**[OFFLINE]** local tests with no network writes, **[CODE]** source inspection.
No deployment, migration, paid AI call, live ingestion or staging write was performed.

## Verdict

The platform is **not fully operational**. The dashboard and the manual compliance workflow work,
but automated ingestion has been down since 17 Nov 04:57 UTC and the publication-to-obligation
automation has never produced a record.

## 1. Deployment, Clerk, Supabase

| Check | Result |
|---|---|
| Live deployment | `dpl_CdFRH1wJDebgkQzbwjJQjAHXNNWi`, build `14ac2ea`, READY [LIVE-RO] |
| `/health` | staging, Clerk + Supabase configured, 36 regulators · 41 sources [LIVE-RO] |
| RLS | enabled on all 58 public tables [LIVE-RO] |
| Cross-tenant links | 0 obligation→change and 0 review→run org mismatches [LIVE-RO] |
| `/sign-out` (signed out) | 404 — fixed in fix branch (public route) [LIVE-RO][CODE] |

## 2. Root cause: scheduled ingestion stopped

- Vercel cron is registered (4 schedules) and targets the live deployment [LIVE-RO].
- `GET /api/internal/ri-ingestion/scheduler-tick` returns **404** on staging [LIVE-RO].
- Last `HOSTED_SCHEDULER_INVOCATION` audit: 17 Nov 04:57 UTC. Daily SCHEDULED runs 12–17 Nov:
  23–38/day; 18 Nov: 10 MANUAL runs only; 19 Nov: none [LIVE-RO].
- The route (and ~40 runtime files) existed only in CLI deployments built from an uncommitted
  working copy. The last such build was `dpl_tVa87yCeHTH2Ny1oubJN5G9NVTpR` (11 Nov 23:13).
  The next deployment (17 Nov 10:54, `de7978c`) and every one since were built from git, which
  never contained the route. About 9 scheduled ticks have been missed.
- Wider loss in the same event: of 870 runtime files in the 11 Nov build, 97 differ from `14ac2ea`
  and 43 are missing (scheduler, curated/listing-PDF/Federal Register connectors, connected-mode
  demo guards in 8 Design Lab views, `/api/sign-out/app-session`, tenant ingest notifications,
  extraction-revision obligation-grade code, 12 migration files).
- All 501 non-generated source files from that build were recovered byte-exact (SHA-1 verified)
  to `%LOCALAPPDATA%\forgeniq-recovered-dpl_tVa87`.

## 3. Why the AI Development dashboard shows zeros

Not a defect. AI Development (`b8f5…0001`) has no changes, impact assessments or obligations;
its only activity is 1 UC-RI-005 run (FAILED, `AI_TIMEOUT`) and 4 workflow events [LIVE-RO].
Operational data lives in FORGENIQ (`cd25bb17`) and Partner UAT (`4d871541`).

Open item: the dashboard shows 197 publications; the table holds 275 and RLS exposes all 275 to
any signed-in user. 197 matches no historical daily total, so it comes from a client-side
filter not yet identified.

## 4. Sources and connectors [LIVE-RO]

- 36 regulators, 41 sources; 39 enabled in operations, 2 disabled (CBUAE rulebook, OFAC SDN).
- `production_status` is NOT_ENABLED for all sources.
- 40 sources have at least one COMPLETED run; 39 have ingested new records; 23 completed within
  the last 72 hours. Currently executing: 0 (scheduler down).
- MoC KSA Companies Law: FAILING, 11 consecutive failures.
- Publications: 275 (272 `regulated-ingestion`, 2 FCA controlled ingest, 1 e2e fixture);
  4 duplicate `source_hash` groups; 0 duplicate external IDs.
- PS26/1: 1 publication; 21 extraction revisions in `regulatory_source_extraction_revisions`.

## 5. Maker-checker [LIVE-RO][CODE]

- Impact approvals: 17/17 by a different user than the submitter.
- AI review: the single accepted review (FORGENIQ, fixture provider) was accepted by the run's
  requester; `submitAnalysisReview` had no segregation check. Fixed in fix branch.

## 6. Offline tests [OFFLINE]

| Suite set | Baseline `14ac2ea` | Fix branch `a5dc881` |
|---|---|---|
| Pass | 24 | 31 |
| Fail | 4 | 2 |
| Not present | 6 | 0 |

- Fixed by the branch: connected route integrity (83a) and lab connectivity (81b), which failed
  on baseline because the demo-guard view code had been lost.
- Remaining failures (also fail on baseline): Phase 6 and Phase 7 static assertions that
  ingestion code must not mention "scheduler"/"cron"; they predate the hosted scheduler.
- Skipped: `ri-scheduler-test`, `phase-8-security-rls` (require a database connection).
- `tsc --noEmit` passes on the fix branch.

## 7. Fix branch (not deployed)

`fix/ri-scheduler-restore-ai-review-sod-2026-11-19` @ `a5dc881`, worktree
`%LOCALAPPDATA%\forgeniq-ri-fixes`, based on `14ac2ea`.

1. Scheduler route + 38-file dependency closure restored from the 11 Nov build; all current
   exports preserved; `pdf-parse-loader.mjs` keeps the newer PS26/1 version.
2. 19 Design Lab views restored; `connected-mode.js` keeps the 95e73f0 org-selection version.
3. 12 migration files restored (already in staging, except
   `20261027153000_ri_extraction_revisions_pdf_primary_profile` and
   `20261105230000_impact_assessment_metadata_provenance`, which staging has not applied).
4. AI review segregation of duties; no `candidates[0]` fallback in materialisation.
5. Draft migration `20261119150000_ri_ai_obligation_pilot_db_guards.sql` (NOT applied).
6. `/sign-out` public.

Deploying this branch re-enables hosted cron ingestion (`liveAllowed: true`) on the next tick,
which counts as activating a live scheduler and needs explicit approval.

Not yet reconciled from the 11 Nov build: the remaining ~60 differing UI/auth/service files
(app shell, account menu, `/api/sign-out/app-session`, tenant notifications). They need a
reviewed, file-by-file merge.
