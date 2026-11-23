# FORGENIQ — Consolidated remediation report (2026-11-23)

## Executive decision

| Area | Status |
|------|--------|
| Local release candidate | **STABLE** — 22/22 consolidated gates, `npm run build` PASS, typecheck PASS |
| Staging RC | **READY FOR HOSTED VALIDATION** — one deploy after this commit (includes provision-cap clamp + SEC-DB-002 fixture alignment) |
| PS22 live extraction | **BLOCKED — SPENDING AUTHORISATION** (97/242 provisions; $1.488 / $2.35) |
| PS26 live accuracy uplift | **READY FOR HOSTED VALIDATION** (deterministic fixes; paid re-extract not in this programme) |
| SEC-DB-003 hosted | **BLOCKED — EXTERNAL DEPENDENCY** (`STAGING_DATABASE_URL`) |
| Production | **NO-GO** |

Cumulative pilot spend: **$1.488222** (includes `9b8fbd1f`, `ffb5ae47`). **No paid runs** executed in this remediation tranche.

---

## 1. Defect register summary

Authoritative machine-readable register: `docs/eval/FORGENIQ-CONSOLIDATED-DEFECT-REGISTER-2026-11-23.json`.

| Metric | Count |
|--------|------:|
| Total registered items | **18** (see `FORGENIQ-CONSOLIDATED-DEFECT-REGISTER-2026-11-23.json`) |
| FIXED AND TESTED | 11 |
| TESTED AND PASSED | 2 |
| FAILED (re-assessment required) | 1 |
| READY FOR HOSTED VALIDATION | 1 |
| NOT EXECUTED — REQUIRES LOCAL DESIGN-LAB SERVER | 1 |
| BLOCKED — EXTERNAL DEPENDENCY | 1 |
| BLOCKED — SPENDING AUTHORISATION | 1 |

Closure report: `docs/uat/FORGENIQ-FINAL-REGULATORY-VERIFICATION-2026-11-23.md`.

Category breakdown: code fixes (5), regulatory accuracy (4), security (1), integration (3), UAT prep (3), test/evidence (2), external (2).

---

## 2. Root causes eliminated (this cycle)

1. **Provision batch cap bypass** — `RI_LAB_MAX_PROVISIONS_PER_BATCH` could exceed 16 (e.g. 512 in shell), breaking preflight and inventory reconcile. **Fix:** clamp env to ≤16 in `resolveMaxProvisionsPerBatch`; gate scripts clear env in child processes.
2. **Spend ledger gaps** — v2 continuation runs not on orchestration ledger. **Fix:** evidence-file run id merge in `pilot-spend-reconcile-staging.mjs`.
3. **Session mutex vs nested reconcile** — post-batch 401. **Fix:** reconcile after `runAs` completes (batch 0 + batch 1 scripts).
4. **SEC-DB-002 test data** — manual `regulatory_changes` without `created_by_user_id`. **Fix:** finding-review + guards scheduler fixtures.
5. **Classification metrics** — conflated operative R marker with `bindingNature` under consultation. **Fix:** dual-axis accuracy report + legal status assessment.
6. **Quotation validation weakness** — presence-only check. **Fix:** verbatim PDF segment matching with page window.

---

## 3. PS22/9 regulatory accuracy

### Publication legal character (corrected 2026-11-23)

`PS22-9-SOURCE-PUBLICATION-VERIFICATION-2026-11-23.json` + `PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT-2026-11-23.json`:

- Source PDF is **PS22/9** (final Consumer Duty policy statement, July 2022), SHA256 `ee1230a9…72f637b`.
- **CP22/09** is a different FCA publication (Dormant Assets); prior **CP22/9** label was **incorrect**.
- PDF contains **made rules** in the legal instrument appendix — not a standalone consultation paper.
- Historical AI runs and audit JSON are **unchanged**; **97** extractions have **`legallyVerifiedCount: 0`** until re-assessment under corrected publication context.

### PRIN 2A.2.14R and 2A.2.26R (batch 1)

| Provision | PDF | Operative marker | As published (corrected) | Historical run presentation |
|-----------|-----|------------------|------------------------|---------------------------|
| 2A.2.14R | NEW_TEXT, set out | R | Final rule in PS22/9 instrument | `consultationPreserved: true` — **misclassification** |
| 2A.2.26R | NEW_TEXT, set out | R | Final rule in PS22/9 instrument | same |

**R** marks rule text in the made instrument. Handbook binding status still requires enactment, applicability, and effective dates — the platform must **not** auto-convert extractions to approved obligations.

### Batch 0 discrepancies (reassessed)

`PS22-9-BATCH0-CLASSIFICATION-DISCREPANCY-2026-11-23.json` — **resolved** (1 engine fix for parenthetical refs; 3 consultation presentation cases).

### Extraction readiness

- **97 provisions** preserved (65 + batch 0 + batch 1).
- **145 provisions / 12 batches** remain — projected **~$1.24** additional under empirical rate → **~$2.73** total without new ceiling (see `PS22-9-CEILING-APPROVAL-REQUEST-2026-11-23.json`).
- Batches **2–8** fit under **$2.35** per batch-start rule.

---

## 4. PS26 remaining accuracy gaps

`FCA-PS26-OPERATIVE-ROOT-CAUSE-REGISTER-2026-11-23.json`:

- **17/17** outstanding operative provisions classified primary root cause: **`AI_EXTRACTION_FAILURE`** (historical runs; deterministic inventory present).
- **Independent PDF truth:** 28 R provisions verified (`FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json`).
- **Live structured recall** among outstanding: **0** (reported separately from omission detection).
- Remediation path **without paid API in this programme:** output preflight, batch sizing, cross-page deterministic candidates (7.20.1R pattern), guards, provision reference parse — **hosted re-extract only when authorised**.

---

## 5. Security

| Test | Result |
|------|--------|
| SEC-DB local harness | **5/5 PASS** |
| SEC-DB staging API | **6/6 PASS** (003 delete route N/A at API — DB harness) |
| Role-aware RLS local | **68 PASS** |
| Maker-checker / guards local | **ALL PASS** |
| SEC-DB-003 hosted restricted-role | **BLOCKED** — `STAGING_DATABASE_URL` (setup in `SEC-DB-003-STAGING-ACCESS-2026-11-23.json`) |

No privileged service-role substituted for restricted-role proof.

---

## 6. Authentication and integration

| Item | Status |
|------|--------|
| User A/B/C staging sessions | **VALID** at audit time |
| `activePersona` mutex | Intentional (prevents wrong attribution) |
| Post-batch spend reconcile | **FIXED AND TESTED** |
| Idempotency suffix inventory | Merge-only (28 suffixes); batch 1 registered |
| Duplicate paid extraction guards | Idempotency markers + no auto-retry in live scripts |

---

## 7. Functional workflow / UAT

| Module | Status |
|--------|--------|
| Consolidated local gates (22 suites) | **TESTED AND PASSED** |
| `acceptance-ri-master` (full Phases 1–7) | **NOT RUN** in this tranche (use before production; prior triple PASS on record) |
| Browser UAT (finding review, applicability, extraction button) | **READY FOR HOSTED VALIDATION** post-deploy |
| End-to-end Regulatory Intelligence UAT | **NOT IMPLEMENTED** — blocked on extraction completion + SEC-DB-003 hosted |

Unexecuted tests are **not** marked passed.

---

## 8. Performance / Vercel

- **Consolidated deployment policy** retained — **one deploy per RC**, not per fix.
- **Polling backoff** present in `uat-poll-ai-run.mjs` (documented in resource optimisations acceptance).
- **No current live CPU meter** — do not rely on stale ~53m snapshot.
- Last staging deploy before this RC: `dpl_MAucFXiAVrXm81QtrmKFw9Gs9pgW` @ `e4664ea` (batch 1 execution).

---

## 9. Paid AI (Phase 9 compliance)

- **No new paid extraction** in this programme.
- Recorded spend: **$1.488222** / ceiling **$2.35**.
- Completion of PS22 requires either partial authorisation (batches 2–8) or **$3.25** approval (not authorised).

---

## 10. Production readiness

**Decision: NO-GO for production.**

**Path to readiness:**

1. Inject `STAGING_DATABASE_URL` → run `acceptance-ri-security-db-staging.mjs`.
2. Consolidated staging deploy of this RC → hosted browser UAT modules.
3. User spending decision for remaining PS22 batches.
4. Optional authorised PS26 re-extract tranche with defined accuracy objective.
5. Full `acceptance-ri-master` + E2E workflow sign-off.

---

## Commits in this remediation tranche (representative)

`4e5b688` … `5f7f54e` (classification, spend, batch 1) plus this cycle: preflight clamp, SEC-DB fixtures, inventory reconcile, defect register, legal status assessment.