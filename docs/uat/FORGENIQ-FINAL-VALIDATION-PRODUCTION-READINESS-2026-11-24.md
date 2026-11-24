# FORGENIQ final validation and production readiness

Date: 2026-11-24. Baseline accepted: `6c3cb49`. This tranche did not restart completed remediation.

Production decision: **NO-GO**.

Code that classifies publications, preserves the 97 historical assessments, and refuses unauthorised paid extraction is in place. Independently verified regulatory outcomes are not. Zero assessments are legally verified. One evidential provision remains in human review. Paid continuation is prepared and not authorised. Hosted restricted-role database proof is blocked. Several hosted workflows were re-read, and several were not executed.

## 1. PS22/9 publication metadata

Corrected. Staging publication `7a73ac4c-d6b4-4411-9f6d-1276053f2831` now has `publication_date` **2022-07-27**.

| Check | Result |
|---|---|
| Identity | Title `PS22/9: A new Consumer Duty`, type `policy_statement` |
| Previous value | `null` |
| Mechanism | Migration `20261124013000_ps22_9_publication_date` |
| Audit | `provenance.metadataCorrections` appended at `2026-11-24T00:51:30Z` |
| Source hash | Unchanged: `a1efed5aca7b00512478f297ec71d36d39a6d79fc024b822555f485dbc75680e` |
| Other publications | Not updated. Three older rows already had a `metadataCorrections` key from 2026-10-26 |
| Applicability PATCH | Not used |
| Hosted API | `GET /api/ri-lab/publications/7a73ac4c-d6b4-4411-9f6d-1276053f2831` returns `2022-07-27` and type Policy Statement |

The catalogue `source_hash` is the ingestion hash. It is not the local PDF SHA256 `ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b`, and it was not overwritten. Effective date was left null because commencement is phased: open products 2023-07-31, closed products 2024-07-31.

No application deploy was required. The existing staging application already maps `publication_date` to the lab view. Current hosted deployment remains `dpl_6YDkQJaukiGguT5kcSkYSMzQfnmB` at `ff83dfe`.

## 2. Hosted workflow results

Read-only session as User A on `https://staging-app.forgeniq.com`. No writes. No paid AI. Evidence: `docs/eval/HOSTED-RI-WORKFLOW-UAT-2026-11-24.json`.

| Workflow | Verdict | Persisted evidence |
|---|---|---|
| Anonymous access | PASS (negative) | Publication GET returned **401** |
| Existing publication read | PASS | Date `2022-07-27`, title and Policy Statement type |
| Catalogue read | PASS | **275** publications |
| New ingestion write | NOT EXECUTED | No new publication was created |
| Classification policy read | PASS | FCA policy GET **200** |
| New classification run | NOT EXECUTED | No new classifier invocation |
| Extraction ledger read | PASS | Status `PARTIAL_PAUSED`, **17** batches |
| New provision extraction | NOT EXECUTED | Paid gate refused execution |
| Regulatory changes | READ PASS | **25** persisted; sample `e22981b0-4a70-4f2c-b30e-6f2a340b0fb4` status OPEN. No new change written |
| Impact assessments | READ PASS | **1** authorised UAT impact `77d960f5-2aff-469f-a316-293d1cb78064`, status Approved. Operational count **0**. No new impact written |
| Obligations | READ PASS | **9** authorised UAT obligations. Operational count **0**. Known obligation `63b84f23-9b4f-424a-96c9-f33eb3192779` is **OPEN** |
| Finding review submission | NOT EXECUTED | Prior local browser suite remains the last executed review. No new hosted submission |
| Maker-checker approval | NOT EXECUTED | No new approval. The OPEN obligation and its audit events are historical |
| Audit trail | PASS | **7** workflow events for that obligation. First sample `bd893ee2-a385-4926-baec-02bae9469813` |
| Notifications | PASS | **22** persisted notifications |
| Board report | READ ONLY | HTTP 200, **0** material changes, **6** empty sections. Not a content pass |
| Risks | NOT PASS | API returned **0**. This organisation has **0** risk rows |
| Controls | NOT PASS | API returned **0**. This organisation has **0** control rows |
| Actions | NOT PASS | API returned **0**. This organisation has **0** action rows |
| Evidence items | NOT PASS | API returned **0**. This organisation has **0** evidence rows |
| Cross-tenant negative | NOT EXECUTED | Users A, B and C share one organisation |

Operational lists exclude authorised UAT records by design. With `scope=all`, the nine obligations and one impact are visible. Empty risk, control, action and evidence lists match this organisation's database. Rows exist in other organisations. That observation used a privileged read and is not a restricted-role tenant-isolation test.

## 3. Regulatory classification

Preserved from the accepted reassessment. Historical AI JSON was not mutated.

| Class | Count |
|---|---|
| Historical extraction records | 97 |
| Corrected from existing verified evidence | 96 |
| Requires human legal review | 1 (`2A.3.30E`, evidential provision, page 119) |
| Valid with no correction | 0 |
| Fresh AI required | 0 |
| Invalid source | 0 |
| Legally verified | 0 |

The application still separates final rules, guidance, evidential provisions, applicability, and phased commencement. An R marker is not treated as legal verification. Quotation recovery is not human approval. No obligation was automatically approved.

`2A.3.30E` remains `REQUIRES HUMAN LEGAL REVIEW` with blockers: human legal review not recorded, maker-checker not recorded, firm applicability not assessed.

## 4. Extraction readiness

Prepared. Not executed.

| Source | Outstanding | Batches | Cap | Preflight | Estimate |
|---|---|---|---|---|---|
| PS22/9 | 145 provisions | 12 | 16 | Pass | $1.237 |
| PS26 | 17 operative requirements | 16 + 1 | 16 | Pass | $0.2057 |

PS22 source remains the verified PDF SHA256 `ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b`, classified as a policy statement. Completed batches `9b8fbd1f` and `ffb5ae47` are excluded. A single 17-provision PS26 batch remains invalid.

`scripts/eval/paid-extraction-sequential-gate.mjs` was run without `--execute`. It called no provider. Problems: none. It refuses `--execute` unless `FORGENIQ_PAID_EXTRACTION_AUTHORISED=PS22-PS26-2026-11-24` and `FORGENIQ_PAID_CEILING_USD` is at least the projected total. The execution path is not implemented in that gate, so authorisation alone cannot start a run. Failed batches are not retried automatically.

## 5. Security

| Test | Result |
|---|---|
| Local SEC-DB-003 (`acceptance-ri-security-db-local-db.mjs`) | Preserved **5/5** from the accepted tranche. Not re-run; no security code changed |
| Staging API (`acceptance-ri-security-db-staging-api.mjs`) | Preserved **6/6**. Not re-run |
| Hosted restricted-role proof | **BLOCKED — EXTERNAL DEPENDENCY** |
| RLS | Unchanged |
| Service role substituted for SEC-DB-003 | No |

`STAGING_DATABASE_URL` is unset in this environment. The privileged migration connection was used only for the single publication-date correction and verification. It is not the SEC-DB-003 proof.

## 6. Outstanding human reviews

- `PRIN 2A.3.30E`: evidential provision. Human legal review is still required. It is not an approved obligation.
- The 96 corrected assessments still require human approval and maker-checker before any can be legally verified.
- Nine hosted obligations are authorised UAT records. Their OPEN status is not legal sign-off of the 97 PS22/9 assessments.
- Firm applicability and phased commencement remain human review matters.

## 7. Current pilot spend

**$1.488222** cumulative. Authorised ceiling **$2.35**. Remaining under that ceiling: **$0.861778**.

No spend was added in this tranche.

## 8. Remaining paid execution

| Item | Amount |
|---|---|
| PS22 continuation, 12 sequential batches | $1.237 |
| PS26, two sequential batches | $0.2057 |
| Additional point estimate | $1.443 |
| Projected cumulative | $2.931 |
| 10% contingency on the additional estimate | $0.144 |
| Projected cumulative with contingency | $3.075 |
| Proposed ceiling $3.25 | **Not authorised** |

Both point estimate and contingency case exceed $2.35. Remaining batches stay blocked until the user explicitly approves a ceiling that covers the run. After that approval, batches run sequentially with the existing cap, output-token preflight, idempotency keys, quotation check, classification check, omission detection, and spend reconciliation. A failed batch stops the sequence.

## 9. External dependencies

- Explicit approval of a paid-extraction ceiling above $2.35.
- `STAGING_DATABASE_URL` for a restricted-role PostgreSQL login before SEC-DB-003 hosted proof can run.
- Human legal review of `2A.3.30E`.
- Maker-checker sign-off before any of the 97 assessments can be marked legally verified.
- A second staging organisation before a cross-tenant negative can be executed with a real session.
- Explicit production approval. Not requested and not performed.

## 10. Production readiness

**NO-GO.**

Ready in code and local evidence:

- PS22/9 identity, policy-statement classification, and hosted publication date 27 July 2022.
- 97 historical records preserved, with 96 evidence corrections and one human review.
- Paid plan for 145 + 17 provisions, gated and unexecuted.
- Local and staging API security tests from the accepted tranche.
- Anonymous refusal, catalogue, change, impact, obligation, audit, and notification reads on staging.

Not independently verified, and therefore not production-ready:

- Legal verification of any PS22/9 provision.
- Human disposition of `2A.3.30E`.
- Live model recall of the 17 PS26 operative gaps.
- Hosted restricted-role delete protection.
- New hosted ingestion, finding review, and maker-checker in this tranche.
- Hosted risk, control, action, and evidence workflows for this organisation.
- Cross-tenant isolation with two organisations.
- A staging deployment of any commit after `ff83dfe`. This tranche did not require one.

No production deployment was made.

## Local gates this tranche

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS. Prebuild recorded build id `6c3cb49` because these changes were still uncommitted |
| RI master, first run | FAIL. Clean local databases have no PS22/9 row, and the migration raised `ps22_9_publication_not_found` |
| Migration adjustment | The statement now does nothing when that row is absent. An unexpected existing date still aborts. Staging was not migrated again; the date is already 2022-07-27 |
| Phase 3A reproducibility | PASS after that adjustment |
| RI master, second run | PASS — 391.5s |

The statement stored by the already-applied staging migration still raises when the row is absent. The repository file is the reproducible version. Both leave the corrected staging row unchanged.
