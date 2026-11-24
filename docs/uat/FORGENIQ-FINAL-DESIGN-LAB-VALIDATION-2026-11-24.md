# FORGENIQ Design Lab — final validation

Date: **2026-11-24**. Accepted baselines: triage deployment **`3b4d3a6`**, dashboard catalogue fix **`314a980`**.  
Official interface: [Design Lab dashboard](https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html#/dashboard)  
Staging deployment: **`dpl_EQmJ39kpih36JA43ZeNH2mfsp9tZ`** on **`forgeniq-platform-staging`** (`https://staging-app.forgeniq.com`).

Production decision: **NO-GO** (regulatory verification, SEC-DB-003 hosted, full write-path UAT, and cross-tenant isolation remain open).

## 1. Phase 1 — Design Lab modules

### Dashboard publication count

**Fixed** at `314a980`. Root cause: connected bootstrap treated an unloaded publication list as zero. The catalogue loader now parallel-fetches `/api/ri-lab/catalogue/summary`, stores `catalogueSummaryTotal` / `publicationTotal`, and `computeDashboardStats()` shows a loading headline or the summary total before the full list arrives.

| Check | Result |
|---|---|
| Hosted headline | **275 publications in staging catalogue** (matches `GET /api/ri-lab/catalogue/summary`) |
| Prior defect | **0 publications** while banner showed ~274 (pre-fix evidence: `docs/uat/evidence/triage-2026-11-24/`) |
| Post-fix evidence | `docs/uat/evidence/design-lab-final-2026-11-24/result.json` + PNGs |

### Triage queues (preserved)

UC-RI-005 completed runs only. Tenant-scoped. No auto-approval. `legallyVerified: false`.

| Queue | Count |
|---|---|
| Obligation Triage | **68** |
| Non-Obligation Triage | **136** |
| Exception Triage | **4** |
| Anonymous `/api/ri-lab/triage` | **401** |

Routes: `#/triage/obligations`, `#/triage/non-obligations`, `#/triage/exceptions`.

### Module matrix (User A, authenticated staging)

| Module | Route | Status | Evidence |
|---|---|---|---|
| Dashboard | `#/dashboard` | **LIVE AND TESTED** | `design-lab-final-2026-11-24/dashboard.png` |
| Regulatory Library | `#/library` | **LIVE AND TESTED** | `publications.png` |
| Obligation Triage | `#/triage/obligations` | **LIVE AND TESTED** | `obligation-triage.png` |
| Non-Obligation Triage | `#/triage/non-obligations` | **LIVE AND TESTED** | `non-obligation-triage.png` |
| Exception Triage | `#/triage/exceptions` | **LIVE AND TESTED** | `exception-triage.png` |
| Obligations | `#/obligations` | **LIVE AND TESTED** (9 UAT rows, operational scope empty) | `obligations.png` |
| Impact Assessments | `#/assessments` | **LIVE AND TESTED** | `impact-assessments.png` |
| Regulatory Changes | `#/changes` | **LIVE AND TESTED** | `changes.png` |
| Reports & Audit | `#/reports` | **LIVE AND TESTED** | `reporting.png` |
| Risks | `#/risks` | **LIVE — operational empty for org** | `risks.png` |
| Controls | `#/controls` | **LIVE — operational empty for org** | `controls.png` |
| Actions | `#/actions` | **LIVE — operational empty for org** | `actions.png` |
| Evidence | `#/evidence` | **LIVE — operational empty for org** | `evidence.png` |
| Notifications | `#/notifications` | **LIVE AND TESTED** (22 alerts) | `notifications.png` |
| Audit Trail | `#/audit` | **LIVE AND TESTED** | `audit.png` |
| Administration | `#/admin` | **LIVE AND TESTED** | `admin.png` |

Legacy `/ri/*` was not used for this validation.

## 2. Phase 2 — End-to-end workflow

One **read-only** hosted pass as User A (no new writes, no paid AI, no fabricated approvals). Writes in this programme require explicit UAT fixtures and segregated roles; they were not re-run on staging in this tranche.

| Stage | Verdict | Persisted evidence |
|---|---|---|
| Publication | **READ PASS** | PS22/9 `publication_date` **2022-07-27**; catalogue **275** |
| Finding (extraction) | **READ PASS** | 16 completed UC-RI-005 runs → 208 triage rows |
| Triage | **READ PASS** | Three queues; API + Design Lab agree on counts |
| Human review | **NOT EXECUTED** (this tranche) | Prior local finding-review suite; no new hosted submission |
| Draft obligation | **NOT EXECUTED** | Draft only via accepted finding review (enforced in API copy) |
| Maker–checker | **NOT EXECUTED** (new) | Historical obligation `63b84f23-9b4f-424a-96c9-f33eb3192779` **OPEN**; **7** workflow events read |
| Impact | **READ PASS** | **1** authorised UAT impact (Approved) with `scope=all` |
| Risk | **READ PASS (empty operational)** | **0** rows for this organisation |
| Control | **READ PASS (empty operational)** | **0** rows |
| Action | **READ PASS (empty operational)** | **0** rows |
| Evidence | **READ PASS (empty operational)** | **0** rows |
| Reporting | **READ PASS** | Board report HTTP **200** (empty material-change set) |
| Audit | **READ PASS** | Workflow events + Design Lab audit route |

API evidence: `docs/eval/HOSTED-RI-WORKFLOW-UAT-2026-11-24.json`.

## 3. Phase 3 — Security

| Test | Result |
|---|---|
| Local RLS (`test:acceptance:phase8-security:local-db`) | **PASS** (this tranche) |
| Staging API SEC suite | **Preserved 6/6** (no security code change) |
| SEC-DB-003 hosted restricted role | **BLOCKED — EXTERNAL DEPENDENCY** (`STAGING_DATABASE_URL` unset) |
| Cross-tenant negative | **NOT EXECUTED** — Users A/B/C share org `b8f5e3a1-00ad-4000-8000-000000000001`; second staging organisation not provisioned |
| Anonymous triage | **401** |

## 4. Phase 4 — Regulatory accuracy

Unchanged from accepted reassessment. **No paid provider calls** in this tranche.

| Item | Status |
|---|---|
| PS22/9 historical records | **97** preserved; **96** evidence-corrected; **1** human review (`2A.3.30E`); **0** legally verified |
| PS22 continuation | **145** provisions, **12** batches, cap **16** — prepared only |
| PS26 operative gaps | **17**, batches **16+1** — prepared only |
| Paid gate (no `--execute`) | Spent **$1.488222** / ceiling **$2.35**; projected **$2.931** — **refused** |

## 5. Phase 5 — Testing and gates

| Gate | Result |
|---|---|
| `acceptance-ri-triage-screens.mjs` | **PASS** (includes dashboard headline guards) |
| `npm run build` | **PASS** (~19 min local; warnings only) |
| Hosted `hosted-triage-screens.mjs` | **PASS** after deploy `314a980` |
| `hosted-ri-workflow-uat.mjs` | **PASS** (read-only API matrix) |
| `paid-extraction-sequential-gate.mjs` | **PASS** (no execution) |
| Staging deploy | **One consolidated deploy** → `dpl_EQmJ39kpih36JA43ZeNH2mfsp9tZ` |
| Production deploy | **None** |

## 6. Design Lab URLs

| Purpose | URL |
|---|---|
| Dashboard | https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html#/dashboard |
| Library | …/index.html#/library |
| Obligation triage | …/index.html#/triage/obligations |
| Non-obligation triage | …/index.html#/triage/non-obligations |
| Exception triage | …/index.html#/triage/exceptions |
| Obligations | …/index.html#/obligations |
| Changes | …/index.html#/changes |
| Impacts | …/index.html#/assessments |
| Reports | …/index.html#/reports |
| Audit | …/index.html#/audit |

## 7. Screenshot and JSON evidence

- Post-fix hosted capture: `docs/uat/evidence/design-lab-final-2026-11-24/` (`result.json` + 16 PNGs).
- Pre-fix triage capture (dashboard **0** headline): `docs/uat/evidence/triage-2026-11-24/`.
- Deploy record: `docs/eval/STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json` (updated `314a980`).

## 8. External dependencies (unchanged blockers)

- Paid-extraction ceiling above **$2.35** (or reduced scope).
- `STAGING_DATABASE_URL` for SEC-DB-003 hosted proof.
- Human legal review of **`2A.3.30E`** and maker–checker before legal verification.
- Second staging organisation for cross-tenant negative testing.
- Explicit production approval.

## 9. Production-readiness assessment

**NO-GO.**

The Design Lab interface on staging now demonstrates a **coherent, authenticated, tenant-scoped** Regulatory Intelligence experience: correct catalogue scale, live triage queues from real extraction runs, and read access across the workflow modules. That is sufficient to prove the **platform shell and integration** are working through the new UI.

Production remains blocked by **independent regulatory verification** (zero legally verified provisions; one open human review), **incomplete hosted write-path and GRC population** for the UAT organisation, **SEC-DB-003 hosted proof**, and **cross-tenant isolation** testing.