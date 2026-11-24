# FORGENIQ — Regulatory accuracy remediation (2026-11-24)

Accepted baseline: source verification and staging deployment **`ff83dfe`**. This tranche does not restart that programme.

Historical AI JSON was not modified. **`legallyVerifiedCount` remains 0.** No paid AI calls. No production deploy. No further staging deploy: the classifier fix is already on staging, and this tranche changes evidence, catalogue metadata and tests only.

## 97 PS22/9 reassessments

Versioned record: `docs/eval/PS22-9-97-VERSIONED-REASSESSMENT-2026-11-24.json` (`ps22-9-legal-reassessment-v1`).

| Disposition | Count |
|-------------|------:|
| Reassessed | 97 |
| VALID — NO CORRECTION REQUIRED | 0 |
| CORRECTED USING EXISTING VERIFIED EVIDENCE | 96 |
| REQUIRES HUMAN LEGAL REVIEW | 1 (`2A.3.30E`, evidential) |
| REQUIRES FRESH AI EXTRACTION | 0 |
| INVALID — SOURCE OR EVIDENCE DEFECT | 0 |
| Legally verified | **0** |

Every row still requires human approval and maker-checker before an obligation is approved. A matching reference or PDF recovery is not legal verification.

The 65 earlier provisions had no structured candidate in local evidence files. Their instrument text was recovered from the verified PS22/9 PDF (SHA256 `ee1230a9…72f637b`). That is a deterministic correction, not a new extraction. Staging extraction records stay as they were.

## Publication date

| Field | Value | Authority |
|-------|--------|-----------|
| Publication / first published | **2022-07-27** | [FCA PS22/9 record](https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty) |
| PDF cover | July 2022 (no day) | Fixture PDF |
| Incorrect earlier report | 2022-07-29 | Unsupported inference |
| Open products and services | 2023-07-31 | FCA “Next steps” |
| Closed products and services | 2024-07-31 | FCA “Next steps” |

Catalogue constant: `integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs`. The hosted `regulatory_publications` row was not rewritten; there is no reviewed publication-date update path in this tranche.

## PS26 — 17 operative gaps

All 17 remain **outstanding live structured recall**. Deterministic omission detection is not live AI recall (`acceptance-ri-ps26-seventeen-operative-omissions`).

Failed stage for all 17 in the historical snapshot: **`supplied_to_model_structured_reference_omitted`**. The model was given instrument sections; structured `provisionReference` values for these cores were not stored. `16.1.6R` is also on `instrumentProvisionsNotSupplied` for the partial-document selection. No local parser defect was found that can invent those structured references without a new model response.

Regression: `acceptance-ri-ps26-seventeen-operative-omissions.mjs`.

## Security

| Test | Result |
|------|--------|
| Local SEC DB | 5/5 including SEC-DB-003 delete guard |
| Staging API | 6/6; SEC-DB-003 skipped (no public delete route) |
| SEC-DB-003 hosted restricted role | **BLOCKED — EXTERNAL DEPENDENCY** (`STAGING_DATABASE_URL`) |

## UAT modules executed

| Module | Result |
|--------|--------|
| Consolidated gates (25, including publication date and PS26 omission lock) | **25/25 PASS** |
| Local extraction-button browser | **PASS** |
| Local applicability browser | **FAIL** — Clerk publishable key null; workflow steps otherwise passed |
| Local finding-review browser | **FAIL** — submit stayed disabled; Finding 2 evidence assertion |
| Staging P2 regression (prior tranche) | 19/19 PASS on `ff83dfe` era staging |
| Impact, risk, reporting, tenant isolation | Covered by existing RI master / local DB suites, not re-run in full this tranche |
| Unimplemented vs untested | Browser failures are **executed failures**, not unimplemented modules |

## Paid execution plan (not run)

Cumulative spend **$1.488222**. Ceiling **$2.35**. Remaining **$0.861778**. Proposed **$3.25** is not approved.

| Work | Paid? | Estimate |
|------|--------|----------|
| Reprocess 97 | No | **$0** |
| 145 PS22 provisions (12 batches, empirical mean $0.103) | Yes, when authorised | **$1.237** |
| 17 PS26 operative live recall (one targeted batch, under the $0.20 cap) | Yes, when authorised | **$0.18** |
| Additional total | | **$1.417** |
| Cumulative if both complete | | **$2.905** |

That exceeds **$2.35** by about **$0.55**. Under the current ceiling a batch may start only when cumulative + $0.20 stays ≤ $2.35. Do not rerun the 97.

## Production

**NO-GO.** Legally verified count is 0, PS26 live recall is open, SEC-DB-003 hosted proof is blocked, and two local browser suites failed.
