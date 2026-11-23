# Milestone report — Vercel resource optimisation tranche (2026-11-23)

## Issues resolved (local — not yet on staging)

- Exponential backoff for UC-RI-005 UAT polling (`uat-poll-ai-run.mjs`).
- PDF evidence process cache with org scope + revision SHA keys.
- `extraction-batch-plan`: grounding sample opt-in (`includeGroundingSample=true`).
- Terminal run GET: `Cache-Control: private, no-store` (no public caching of regulatory payloads).
- Parallel pilot spend reconcile (chunk size 4).
- Staging deploy throttle (15 min default; `FORCE_STAGING_DEPLOY=1` override).
- Application metrics hook (`FORGENIQ_LAB_RESOURCE_METRICS=true`).
- Orchestration `patch_spend_cap` (from pilot session; included in tranche).
- Policy: milestone-based deployment (`CONSOLIDATED-DEVELOPMENT-DEPLOYMENT-POLICY.md`).

## Tests passed (local)

| Suite | Evidence |
|-------|----------|
| Resource optimisations acceptance | `docs/eval/RESOURCE-OPTIMISATIONS-ACCEPTANCE-2026-11-23.json` — **8/8 PASS** |
| Platform `npm run build` | Passed during tranche |
| FCA PS26 benchmark (local, no paid AI) | `docs/eval/FCA-PS26-ACCURACY-BENCHMARK-REVISED-2026-11-23.json` |
| RI master | **3/3** preserved (not re-run this tranche) |

## Git commit

Pending: single commit on `feature/ri-classification-triage` after this report (Vercel resource + policy tranche).

## Staging deployment

**Deferred intentionally** — per consolidated deployment policy. Next deploy = **one** push of this tranche with UAT objective: verify metrics logs, batch-plan without double PDF load, poll backoff in a single dry orchestration read.

**No** deploy to `platform` or `brieftick`.

## Hosted UAT

Not run for this tranche (local gates only).

## Outstanding

| Item | Status |
|------|--------|
| PS22 batch 5 remediation | Not started; failed run `9fd62178` preserved |
| Paid hosted extraction | **Paused** until batch 5 deterministic acceptance + usage OK |
| SEC-DB-003 hosted | Blocked: `STAGING_DATABASE_URL` |
| Staging deploy of tranche | Next milestone action |
| Deployment storage cleanup | Inventory `STAGING-DEPLOYMENT-CLEANUP-INVENTORY-2026-11-23.json`; **no deletes** |

## Vercel usage impact

**Measured (prior session):** Hobby CPU heavily consumed by same-day staging deploy volume + long `ai-analysis-runs` + 4s poll loops (see `VERCEL-RESOURCE-AUDIT-2026-11-23.md`).

**This tranche:** Reduces **future** invocations when deployed; **no measured reduction yet** on hosted (code not deployed).

## Pilot spend preserved

Cumulative **~$1.282** / **$2.35**; PS26/1 success; PS22 batches **0–4** pass; batch **5** failed evidence retained.