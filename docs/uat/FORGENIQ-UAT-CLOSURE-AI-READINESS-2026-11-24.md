# FORGENIQ — UAT closure and AI readiness (2026-11-24)

Accepted baseline: **`b60cf8c`**. Historical AI responses and the 96 evidence corrections are unchanged. No paid extraction. No production deploy. No new staging deploy: this tranche did not change hosted runtime behaviour.

## 1. Applicability browser — PASS

Root cause was local configuration. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` was not in gitignored `.env.local`. It was only in `.env.staging.pull`, which `next start` does not load. The application correctly refused to inject a missing key. The public publishable key was added to `.env.local` and was not committed. Authentication was not bypassed.

`acceptance-ri-applicability-workflow-browser.mjs`: **PASS (0 failures)** on `http://127.0.0.1:3001`.

## 2. Finding-review browser — PASS

Submit stayed disabled because the test had not supplied the mandatory provision function, provision reference and obligation wording. That block is correct. The test now fills `OPERATIVE_REQUIREMENT`, `86(2C)R` and the obligation statement, and it checks those fields on the posted payload. Review rules were not relaxed.

`acceptance-ri-uc-ri-005-finding-review-browser.mjs`: **PASS (0 failures)**.

## 3. PS22 reassessments

Preserved: 97 historical records, 96 traceable corrections in `docs/eval/PS22-9-97-VERSIONED-REASSESSMENT-2026-11-24.json`, one human review (`2A.3.30E`), zero paid re-extractions. `legallyVerifiedCount` remains **0**. Corrections are not written back into historical AI JSON and are not auto-approved obligations. New extractions use the final PS22/9 classifier already deployed at `ff83dfe`.

## 4. PS26 corrected batch plan

A single 17-provision batch is invalid. Plan: `docs/eval/PS26-17-OPERATIVE-PAID-PLAN-2026-11-24.json`.

| Batch | Provisions | Output preflight | PDF index | Estimate |
|------:|-----------:|------------------|-----------|----------|
| 0 | 16 | PASS | all 16 present | $0.1936 |
| 1 | 1 | PASS | present | $0.0121 |
| Total | 17 | | | **$0.2057** |

Cap remains 16. Historical snapshot is not recharged. Not executed.

## 5. PS22 continuation readiness

`docs/eval/PS22-9-CONTINUATION-READINESS-2026-11-24.json`: **145 provisions, 12 batches, ready**. No overlap with the 97. Every batch is within the 16-provision cap and output preflight. Source SHA256 `ee1230a9…72f637b`. Publication type is `policy_statement`, not consultation. Estimate **$1.237** using the empirical batch mean. Not executed.

## 6. Spending forecast

| Item | USD |
|------|----:|
| Cumulative spend | 1.488222 |
| Authorised ceiling | 2.35 |
| Remaining | 0.861778 |
| PS22 remaining 145 | 1.237 |
| PS26 17 (two batches) | 0.206 |
| Additional before contingency | 1.443 |
| 10% contingency | 0.144 |
| Additional with contingency | 1.587 |
| Cumulative if both complete | **3.075** |

That exceeds **$2.35**. With the 10% contingency the cumulative figure is **$3.075**, which is inside the unapproved **$3.25** proposal and outside the authorised ceiling. Under **$2.35** only a subset of batches can start. No paid calls were made.

## 7. Hosted metadata

GET `/api/ri-lab/publications/7a73ac4c-d6b4-4411-9f6d-1276053f2831` returned **200**. Title is “PS22/9: A new Consumer Duty”. Type is **Policy Statement**. `publication_date` is **null**, not 27 July 2022 and not 29 July 2022. Evidence: `docs/eval/PS22-9-HOSTED-PUBLICATION-METADATA-2026-11-24.json`.

The publication PATCH route only writes applicability assessments. It was not used. No service-role update was run. An audited date correction is still required before the hosted row matches the FCA record. Audit history was not overwritten.

## 8. Security

| Check | Result |
|-------|--------|
| Local SEC DB | 5/5 |
| Staging API | 6/6 |
| SEC-DB-003 hosted restricted role | **BLOCKED — EXTERNAL DEPENDENCY** (`STAGING_DATABASE_URL` unset) |

## 9. End-to-end UAT

| Module | Result |
|--------|--------|
| Applicability browser | PASS |
| Finding-review browser | PASS |
| Extraction-button browser | PASS in the prior local run; not repeated this tranche |
| Staging P2 maker-checker regression | PASS on the prior staging release |
| Impact, risk, controls and reporting | Not re-executed as a hosted browser journey in this tranche |
| RI master | **PASS** (257.8s) |
| Typecheck and production build | **PASS** |

Unexecuted hosted journeys are not marked passed.

## 10. External dependencies

- `STAGING_DATABASE_URL` for SEC-DB-003.
- Spend authorisation above **$2.35** before the full 145 + 17 paid plan.
- Audited write path for the null hosted `publication_date`.

## 11. Production

**NO-GO.**
