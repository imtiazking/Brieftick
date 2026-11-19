# FORGENIQ — Regulatory Intelligence restoration: release candidate report

Date: 19 Nov 2026
Branch: `release/staging-ri-rc2-2026-11-19` (worktree `C:\Users\imtia\AppData\Local\forgeniq-ri-rc2`)
Parent commits: `79e0270` (three-way restore) → this commit (restoration completion).
Not deployed. No migrations applied to staging. No paid Anthropic calls. No staging writes. Scheduler not activated.

## 1. Final commit

The commit containing this report on `release/staging-ri-rc2-2026-11-19` (hash reported in the hand-off message and in `git log`).
Current staging remains `dpl_CdFRH1wJDebgkQzbwjJQjAHXNNWi` (`14ac2ea`), untouched.

## 2. Files recovered and restored

- `a5dc881`: hosted scheduler route and dependency closure restored byte-exact from `dpl_tVa87yCeHTH2Ny1oubJN5G9NVTpR` (11 Nov, last working cron build); 19 Design Lab view files; 12 migration files.
- `79e0270`: remaining ~50 recovered files merged by three-way review against base `7fa0883` (no blind replacement; newer approved versions kept where they diverged).
- This commit: Design Lab bundle resynced from source (6 files, byte-identical to `design-lab/regulatory-intelligence`), plus the fixes below.
- Backups: `C:\Users\imtia\FORGENIQ-backups\2026-11-19` and `C:\Users\imtia\OneDrive\FORGENIQ-backups\2026-11-19` (recovered deployment zip + SHA1 manifest, per-worktree patches and untracked archives, all-refs git bundle).

## 3. Functionality fixed

Scheduler
- Stale `RUNNING` runs (> 30 min, longer than the 300 s route limit) are recovered to `FAILED/TRANSIENT` with an audit event, so a killed invocation can no longer block a source forever.
- `?dryRun=1` on `/api/internal/ri-ingestion/scheduler-tick`: bearer-authenticated, read-only transaction, reports what would run without running it, works while the scheduler is disabled.
- Failures are audited (`HOSTED_SCHEDULER_FAILED`); missing database URL returns 503.
- `apps/platform/vercel.json` no longer contains `crons` — deploying this build cannot start scheduled ingestion.

Publication → obligation chain (why nothing reached the register)
- Org A Anthropic runs (3 Nov) predate the claim normaliser (`d7e6df0`, 14 Nov) and stored 0 citations, so every candidate would be skipped; they were never reviewed and Org A is now excluded from AI.
- The AI Development UC-RI-005 run (18 Nov) timed out and had no parent change; the UI called the parent change "Optional" and materialisation silently skipped obligations without one.
- Applicability assessment was never part of the chain (0 assessments in every tenant).
- Obligation status had no transition rules or maker-checker for AI obligations.

Fixes
- UC-RI-005 now requires a parent regulatory change from the same publication and an approved applicability assessment (`APPLICABLE` / `POSSIBLY_APPLICABLE`), checked before the run is created (no spend) and again at review.
- Materialisation uses only the run's server-side target change (AI-supplied change IDs ignored); skipped candidates are recorded with reasons and an `AI_MATERIALISATION_SKIPPED` workflow event.
- AI obligations go `DRAFT → IN_REVIEW → OPEN`; `OPEN` requires the review role and a different person from the run requester, the acceptor and the submitter. Enforced in the service and (draft migration) in the database.
- Obligations land in the existing `regulatory_obligations` register; risk/control/evidence links use the existing workflows. No second register.
- Tenant guard errors return 403; chain prerequisite errors return 422. UI label now says the parent change is required.

Publication count (197 vs 275)
- 275 = 272 `regulated-ingestion` + 2 `fca_catalogue_controlled_ingest` (FG22/5, PS26/1) + 1 `e2e_fixture`; 118 have no publication date.
- The API read only the first 200 rows by date (nulls last), cutting 75 undated regulatory publications; the default operational scope then hid the 2 FCA catalogue records → 197.
- Fixed by paging all rows and classifying FCA catalogue ingest as regulatory. Result: all = 275, operational = 274 (fixture excluded). No publication data changed.
- Per tenant (publications are global under RLS): triage rows FORGENIQ 3 (2 open), Partner UAT 4, AI Development 0, Security Isolation B 0; applicability assessments 0 everywhere.

## 4. Scheduler readiness

Ready but off. 39 enabled staging sources all have allowlist, connector and catalogue entries; 0 stuck runs; MOCI-SA has 11 consecutive failures; `next_run_at` values are stale (17–18 Nov) so the first tick will pick up all sources (bounded by `FORGENIQ_RI_SCHEDULER_BATCH_SIZE`).

## 5. Publication-to-obligation status

Code path complete and tested offline and on an isolated database. Not yet exercised on staging: AI Development has no publications triaged, no regulatory change and no approved applicability assessment, and a real UC-RI-002/UC-RI-005 run needs paid Anthropic approval.

## 6. Tests

Offline / local (no staging access): 36 of 36 present pass.
- Typecheck (`tsc --noEmit`) and `next build`: pass.
- Tenant (5), AI (7, including new chain-gates and DB-guards local-DB tests), ingestion (10, including phase 6, phase 7 and new 8d4 readiness), PDF (4), workflow (6), UI browser (3, against a local `next start` on port 3001).
- `phase8d1-hosted-scheduler-auth.test.mjs` is not in this branch (superseded by 8d2).

The two earlier failures (phase 6 and phase 7) were obsolete assertions, not defects:
- Phase 6 searched for the word "scheduler" anywhere in the ingestion layer; the hosted scheduler legitimately lives in `ops/`. Now checks for actual scheduling code outside `ops/`.
- Phase 7 marked its fixture sources `TEST_ONLY`, but the restored hosted scheduler (the 11 Nov version that ran in staging) only selects sources whose `regulatory_sources.ingestion_mode` is `ENABLED`. Fixture updated; the run remains offline (`liveAllowed=false`, fixtures only).

Environment note: embedded Postgres on Windows sometimes hangs on shutdown or leaves a child process holding shared memory. Stopping the leftover `@embedded-postgres` process clears it; the test logic is unaffected.

Authenticated staging tests were not run in this pass (they need a signed-in session and are kept separate).

## 7. Migration readiness

Tested on an isolated embedded Postgres (UTF-8, all migrations in order): apply, behaviour, rollback, re-apply over legacy rows, idempotency — 42 checks pass.
- `20261027153000`: comments only.
- `20261105230000`: column and index already exist in staging; applying records the version only.
- `20261119150000_ri_ai_obligation_pilot_db_guards` (draft): pilot-org and segregation-of-duties triggers; depends only on existing tables/columns. Rollback: `supabase/rollbacks/20261119150000_ri_ai_obligation_pilot_db_guards.down.sql`.
Apply only with approval, in that order.

## 8. Blockers

- Approval needed: migrations, deployment, scheduler activation, paid UC-RI-002/UC-RI-005 runs.
- AI Development tenant has no triaged publication, change or approved applicability assessment to run the chain on.
- MOCI-SA source failing (11 consecutive).
- Org A AI runs cannot be reviewed (correctly excluded).

## 9. Safe deployment procedure (when approved)

1. Deploy this commit to a preview of the staging project (not production alias).
2. Confirm `apps/platform/vercel.json` has no `crons`.
3. Call `GET /api/internal/ri-ingestion/scheduler-tick?dryRun=1` with `Authorization: Bearer $CRON_SECRET`; expect `dryRun:true` and the due-source list, and no new `ingestion_runs`.
4. Smoke-test sign-in, dashboard, publications (all = 275, operational = 274), obligations, AI analysis panels.
5. Promote; rollback target `dpl_ApvvkQ7L81RHcDNdBeJv2KEQi1CX` (current live `dpl_CdFRH1wJDebgkQzbwjJQjAHXNNWi`).
6. Apply migrations separately, after approval, and re-run the guard checks.

## 10. Scheduler activation procedure (when approved)

1. Run the dry run (step 9.3) and review the due list.
2. Restore the `crons` block in `apps/platform/vercel.json` (path `/api/internal/ri-ingestion/scheduler-tick`, schedules `0 0 * * *`, `0 4 * * *`, `0 12 * * *`, `0 20 * * *`).
3. Update the "no crons" assertion in `scripts/staging/phase8d4-hosted-scheduler-readiness.test.mjs`.
4. Confirm `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true` and the batch size in the staging project.
5. Redeploy; monitor `HOSTED_SCHEDULER_*` and `SCHEDULER_*` audit events and `ingestion_runs` for the first ticks.
6. To stop: set `FORGENIQ_RI_SCHEDULER_CRON_ENABLED` to anything other than `true` (the route then refuses to run) or remove the `crons` block.
