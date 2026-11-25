# Hosted five-stage lifecycle UAT — 2026-11-25

**Run:** `UAT-LIFECYCLE-20261125-mwwlgtyw`  
**Host:** `https://staging-app.forgeniq.com`  
**Deployment exercised:** `dpl_DALWABZ2iGk571HjAD2kYoVswAkq` (`ae4b828`)  
**Layer:** hosted Design Lab API with saved Users A, B and C. Not an offline fixture replay.

## Identifiers

| Record | Id |
|--------|----|
| Obligation | `0222809b-b74e-4577-88d4-e1d8701f5385` |
| Impact | `ed1cdfef-2fcc-473a-bb14-97f4adecd649` |
| Risk | `4e650e3e-4677-43f5-9557-01215addd3fa` |
| Control | `88a5bab9-ed49-4c58-ad57-de3d59254019` |
| Assurance | `02f84855-ea94-4df7-a990-f31a3f60dd00` |
| Evidence | `c94976f9-4bab-4bec-8664-d2b288dba2f4` |
| Finding | `3b8a5332-5f95-41dd-be10-48425cfc6cb6` |
| Remediation action | `90d25201-29ed-4ad4-94b7-6aefae660488` |

## Results

| Check | Layer | Status |
|-------|-------|--------|
| Users A/C COMPLIANCE_MANAGER, B REVIEWER | hosted-auth | PASS |
| Create synthetic obligation | hosted-api | PASS |
| Maker cannot jump Draft to OPEN | hosted-api | PASS (`ai_obligation_invalid_transition`) |
| Submit IN_REVIEW as User A | hosted-api | PASS |
| User B OPEN while still unapproved path | hosted-api | PASS as denial on the first attempt (403) after submit; an earlier attempt returned **500** and committed OPEN without Stage 2 |
| User C OPEN | hosted-api | PASS |
| Stage 2 impact auto-draft after C's OPEN | hosted-api + database | PASS `ed1cdfef-…` |
| Impact self-approval denied, A submit, C approve | hosted-api | PASS |
| Stage 3 risk auto-draft, SoD, C approve | hosted-api + database | PASS `4e650e3e-…` |
| Stage 4 control auto-draft | database | PASS `88a5bab9-…` (list API `scope=all` did not return the UAT row to the script) |
| Control SoD, C approve | hosted-api | PASS |
| Stage 5 plan NOT_TESTED | database | PASS `02f84855-…` |
| Plan submit, premature close denied, plan approve | hosted-api | PASS |
| Synthetic evidence + FAIL test | hosted-api | PASS |
| Close while failed | hosted-api | PASS (denied) |
| Wrong-control evidence | hosted-api | PASS (denied) |
| Complete remediation | hosted-api | PASS |
| Retest PASS | hosted-api | PASS |
| Close blocked while finding open | hosted-api | PASS (guard) |
| Exception accepted, retest after reopen, independent close | hosted-api | PASS |
| Duplicate close | hosted-api | PASS (200 idempotent) |
| `COMPLIANCE_LIFECYCLE_CLOSED` and `COMPLIANCE_LIFECYCLE_REOPENED` on the obligation | hosted-api | PASS |
| Obligation screen screenshot | hosted-browser | PASS `obligation-lifecycle.png`, `obligation-after-close.png` |
| Hosted cross-tenant | hosted-api | **BLOCKED** — A, B and C share one organisation. Offline RLS remains in `RI-ASSURANCE-GOVERNANCE-SECURITY`. |

## Defect found

Reviewer (or any caller whose Stage 2 insert is rejected) can leave an obligation OPEN when `ensureImpactAssessmentFromApprovedObligation` throws after the status update. Recovered on this run by moving the synthetic obligation back to In review and approving again as User C. Code now rejects OPEN unless the actor has `impact:approve`, and rolls the status back if Stage 2 throws. That correction is **not** on `dpl_DALWABZ2iGk571HjAD2kYoVswAkq` until the next candidate-first deploy.

Paid AI was not executed. Production was not deployed.
