# Consolidated milestone — 2026-11-22 (P2 tranche)

## Accepted

- **RI-CLS-003** staging UAT (`CLASSIFICATION-POLICY-ADMIN-STAGING.json`)

## Priority 1 — Full publication extraction (RI-CLS-007)

- **Operational workflow:** `advanceOrchestrationBatch`, `runOrchestrationBatchesAutomatic`, `buildConsolidatedHumanReview`, API `action: advance | advance_all_simulated`, Design Lab “Next batch (authorised run)”.
- **Simulated E2E gate:** `acceptance-ri-publication-extraction-e2e.mjs` **8/8**; engine **13/13**; orchestrator **6/6**.
- **Live multi-batch on staging:** not run (no paid AI).
- **Next:** costed scenarios in `PAID-EXTRACTION-COSTED-TEST-PLAN-2026-11-22.json`.

## Priority 2 — FCA UAT

| Item | Status |
|------|--------|
| PS22/9 obligation `68051a63` approval chain | **OPEN** on staging (verified) |
| RI-CLS-005 negative evidence | `RI-CLS-005-NEGATIVE-CONVERSION-EVIDENCE.json` |
| CONC 7.20.1R(2) | Prep in costed plan; AI conversion still open |
| Positive E | Targets **PRIN 2A.4.35E** on PS22/9 — not executed |
| Broad partial extractions | **Excluded** by plan |

## Priority 3 — Classification policies

| Item | Status |
|------|--------|
| FRC active policy audit | **Not authoritative** — `REG-FRC-POLICY-AUDIT-2026-11-22.json` |
| PRA / ICO / PSR | Draft policy parameters in `REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json` — **not activated** |

## Priority 4 — Security and governance

| Item | Status |
|------|--------|
| OP2 operator change | `PLATFORM-OPERATOR-CHANGE-APPROVAL-RECORD-2026-11-22.json` |
| Operator change audit backlog | **SEC-GOV-001** added |
| Maker-checker | Confirmed in UAT (403 self-activate; tenant 403) |
| Admin writes after UAT | **Disabled** on staging (`RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED=false`, redeployed) |

## Regression

- P2 staging regression: **19/19** (FRC now expected ACTIVE).

## Out of scope (unchanged)

- Production deployment
- Additional paid AI calls
- CONC 7.20.1R(2) register entry without approved extraction