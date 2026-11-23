# FORGENIQ Regulatory Intelligence — production readiness report (2026-11-23, accepted baseline; progress update)

**Baseline decision accepted:** **NO-GO for production** until live extraction accuracy is evidenced and RI master passes three consecutive full runs.

This update reflects commit **`e0d1994`** and autonomous execution on 2026-11-23 (08:24 UTC tranche).

## Readiness tiers

| Tier | Definition | Decision |
|---|---|---|
| **1 — FCA pilot** | FCA corpus + staging UAT + authorised live extraction for PS26/1 & PS22/9 | **NO-GO** — batch 0 reconciled; batch 1+ blocked on staging app deploy |
| **2 — Wider RI** | Multi-regulator catalogue, ingestion, classification fail-closed, platform UAT | **NO-GO** — FCA only verified/activated; FRC suspended |
| **3 — 36 regulators** | Verified policy per regulator + activation + UAT | **NO-GO** — 1 verified active (FCA); 31+ outstanding |

## Git and staging

| Item | Value |
|---|---|
| Branch | `feature/ri-classification-triage` |
| Head commit | `e0d1994` (pilot poll fix, PDF batch fallback, stale AI recovery, harness retry) |
| Staging runtime | Still on prior deployment (`dpl_Hrtx7ABaxJBZBBxt9mBYnEZtVYuc` class) — **new commit not deployed** |
| Deploy blocker | Local `vercel deploy --prod` rejected token; Vercel MCP lists **0 projects** for connected account |
| Production | **Not deployed** (mandatory approval unchanged) |

## Priority 1 — Live full-publication extraction

| Item | Status |
|---|---|
| Batch 0 reconcile | **DONE** — run `2c840c0b-0534-4429-a02d-6db8850a3f91`, idempotency `live-ps26-full-2026-11-22`, **COMPLETED**, 12 claims; orchestration 40/47 supplied |
| Evidence | `PS26-1-BATCH-0-RUN-RECONCILIATION-2026-11-23.json` |
| Duplicate paid POST | **None** for batch 0 (marker + idempotency GET) |
| Batch 1 POST | **FAIL** — `internal_error` (pre-deploy: batch-2 PDF grounding on staging runtime) |
| Async durability | RUNNING row inserted **before** dispatch; `recoverStaleAiAnalysisRuns` on UC-RI-005 POST; `maxDuration` 300s on route |
| Spend | **≤ $2 cap**; batch 0 reuses prior run — incremental spend on batch 1+ only after deploy |
| Accuracy metrics | `LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json` (proxy recall; full precision after batches complete) |

**Mandatory next step:** Deploy `e0d1994` to `staging-app.forgeniq.com`, then resume pilot from batch 1 (no batch-0 repost).

## Priority 2 — Master acceptance

| Item | Status |
|---|---|
| Phase 3A / harness | Random-port retry after shared-memory collision (**fixed** in `e0d1994`) |
| Phase 5 downstream | **PASS** (standalone, post-fix) |
| RI master ×3 | **IN PROGRESS** (`acceptance-ri-master-triple.mjs` run 1/3 started 08:24 UTC) |

## Priority 3 — SEC-DB (hosted)

| Control | Local | Staging DB objects | Hosted RLS role-play |
|---|---|---|---|
| SEC-DB-001 finding close | 5/5 | Triggers present (`ri_guard_finding_close`) | **Pending** (`STAGING_DATABASE_URL`) |
| SEC-DB-002 creator binding | 5/5 | `ri_guard_manual_finding_creator` | **Pending** |
| SEC-DB-003 audit immutability | 5/5 | `ri_guard_workflow_events_immutable` | **Pending** |

Evidence: `SEC-DB-STAGING-VALIDATION-2026-11-23.json`

## Priority 4 — Regulators

Unchanged from `REGULATOR-READINESS-MATRIX-2026-11-23.json`. **FCA** operational for classification; **FRC** active with conversion suspended; **PRA, ICO, PSR** draft-only — not activated.

## Priority 5 — E2E platform UAT

Partial prior staging sessions (Users A/B/C). Full journey UAT deferred until P1 pilot completes.

## Priority 6 — Operations

| Area | Status |
|---|---|
| Migrations | Staging includes orchestration + SEC-DB hardening |
| Monitoring / rollback | Documented; not re-verified this tranche |
| AI spend controls | Suffix allowlist + idempotency enforced |

## Genuine blockers requiring intervention

1. **Staging application deploy** — operator must refresh Vercel credentials (`vercel login`) or deploy `e0d1994` via linked CI; until then batch 1+ extraction cannot complete on staging.
2. **Hosted SEC-DB role-play** — requires `STAGING_DATABASE_URL` in operator environment (or approved secrets channel).

## Consolidated decision

| Scope | GO? |
|---|---|
| FCA-only production | **NO** |
| Wider RI production | **NO** |
| Full 36-regulator production | **NO** |