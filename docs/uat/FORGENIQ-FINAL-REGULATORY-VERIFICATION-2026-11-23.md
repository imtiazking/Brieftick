# FORGENIQ — Final regulatory verification and UAT closure (2026-11-23)

## Decision summary

| Area | Outcome |
|------|---------|
| 242-provision source identity | **PS22/9** — SHA256 verified locally |
| Consumer Duty legal narrative | **Corrected** — final policy statement + made rules (not CP22/9) |
| 97 paid extractions | **Preserved** — structurally complete; **0 legally verified** pending re-assessment |
| Consolidated gates | **23/23 PASS** |
| RI master acceptance | **PASS** (~254 s) |
| Hosted browser workflow | **19/19 PASS** (`staging-p2-regression.mjs`) |
| Local design-lab browser (3 modules) | **NOT EXECUTED** (no `:3001` server this tranche) |
| SEC-DB-003 hosted | **BLOCKED** (`STAGING_DATABASE_URL`) |
| Paid PS22 continuation | **NO-GO** — ceiling / authorisation |
| Production | **NO-GO** |

Cumulative pilot spend: **$1.488222** (ceiling **$2.35**). **No paid extraction** in this closure tranche.

Evidence index: `docs/eval/PS22-9-SOURCE-PUBLICATION-VERIFICATION-2026-11-23.json`, `PS22-9-97-PROVISION-REVALIDATION-2026-11-23.json`, `FORGENIQ-CONSOLIDATED-DEFECT-REGISTER-2026-11-23.json`.

---

## 1. Exact identity of the 242-provision source

| Field | Value |
|-------|--------|
| FCA reference | **PS22/9** |
| Official title | **A new Consumer Duty — Feedback to CP21/36 and final rules** |
| Canonical URL | https://www.fca.org.uk/publication/policy/ps22-9.pdf |
| Publication date | **29 July 2022** |
| Publication type | **Policy Statement** |
| Document character | Final policy statement with **Appendix 1 — Made rules (legal instrument)** |
| Proposed vs final in PDF | **Final rules** as made in this instrument (body references **CP21/36** consultation history; **not** CP22/09) |
| Subsequent enactment | PRIN 2A Consumer Duty rules made via PS22/9; Handbook binding status depends on **applicability, commencement, and firm scope** — not inferred from **R** suffix alone |
| Legal instrument | PS22/9 made-rules instrument (PRIN 2A and related modules in appendix) |
| Platform publication UUID | `7a73ac4c-d6b4-4411-9f6d-1276053f2831` |
| Fixture | `integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf` |
| SHA256 (full) | `ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b` |
| Bytes | 1,380,128 |

**Defect identified:** Human/script narrative incorrectly labelled the PDF as **CP22/9 Consumer Duty consultation**. **CP22/09** is the Dormant Assets scheme consultation — a different publication.

**Runtime defect (fixed locally):** `analyzeRegulatoryPdfDocument` matched generic “consultation” language (CP21/36 feedback) before policy-statement signals, setting `consultationPreserved: true` on live extractions.

---

## 2. Correct legal status of Consumer Duty provisions

Distinctions enforced by corrected assessment (`PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT-2026-11-23.json`):

| Layer | PS22/9 position |
|-------|------------------|
| Publication type at issue | Final **policy statement** |
| Rules in PDF | **Made** in the legal instrument appendix |
| PRIN 2A.2.14R / 2A.2.26R in source | **Final rule text** in the PS22/9 instrument with operative **R** markers |
| Current Handbook status | **Binding rules** for in-scope firms when enacted and in force (Handbook confirms PRIN 2A rules) |
| Platform obligation conversion | **No auto-approval** — human review, quotation within made rules, applicability and effective dates required |

Historical AI runs presented provisions under **`consultationPreserved: true`** — incorrect for PS22/9. Subsequent assessment records the correction without mutating stored AI JSON.

---

## 3. Validity of the 97 completed assessments

| Metric | Result |
|--------|--------|
| Provision count | **97** (65 preserved + batch 0 + batch 1) |
| Historical JSON | **Unchanged** |
| Structured extraction completeness | Batch evidence present; per-core rows in revalidation file |
| **Legally verified count** | **0** |
| Reason | Publication regulatory context on runs used consultation guards incompatible with PS22/9 final rules |

**Do not** report the 97 as legally verified until a traceable re-assessment programme completes under corrected `policy_statement` / `publishedFinalRules` context.

---

## 4. Corrections applied (this tranche)

- `integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs` — final policy statement detection; `consultationPreserved` false when final rules published.
- `acceptance-ri-regulatory-pdf-analysis-ps22.mjs` — regression guard.
- `verify-ps22-9-source-publication.mjs` + verification JSON.
- `ps22-publication-legal-status-assessment.mjs` rewritten for PS22/9 (supersedes CP22/9 narrative).
- `ps22-97-provision-revalidation.mjs` + revalidation JSON.
- Consolidated defect register reconciled to **18** items with explicit statuses.

---

## 5. Full RI master test results

`node apps/platform/scripts/acceptance-ri-master.mjs` — **PASS** (254.2 s, all phases 1–7 + catalogue).

---

## 6. Hosted workflow UAT results

| Module | Environment | Result |
|--------|-------------|--------|
| `staging-p2-regression.mjs` | staging-app.forgeniq.com | **19/19 PASS** |
| `acceptance-ri-security-db-staging-api.mjs` | staging API | **6/6 PASS** |
| `acceptance-ri-uc-ri-005-finding-review-browser.mjs` | localhost design-lab | **NOT EXECUTED** |
| `acceptance-ri-applicability-workflow-browser.mjs` | localhost design-lab | **NOT EXECUTED** |
| `acceptance-ri-uc-ri-005-extraction-button-browser.mjs` | localhost design-lab | **NOT EXECUTED** |

Staging personas A/B/C: **VALID** (`staging-user-sessions.mjs status`).

Publication ingestion, PS26 maker-checker, audit, SoD, and policy fail-closed paths exercised on staging via P2 regression. Full UC-RI-005 simulated-write browser suite requires a local design-lab server on port 3001.

---

## 7. Security blockers

**SEC-DB-003 (hosted restricted-role PostgreSQL proof): BLOCKED**

- Local: `acceptance-ri-security-db-local-db.mjs` **5/5**
- Staging API: `acceptance-ri-security-db-staging-api.mjs` **6/6**
- Hosted DB harness: requires **`STAGING_DATABASE_URL`** (restricted role; no service-role substitution)

Setup: `docs/eval/SEC-DB-003-STAGING-ACCESS-2026-11-23.json` → `secureSetupInstructions`.

---

## 8. Reconciled 18-item defect register

Authoritative: `docs/eval/FORGENIQ-CONSOLIDATED-DEFECT-REGISTER-2026-11-23.json`.

| ID | Title | Status |
|----|-------|--------|
| DEF-0001 | Continuation v2 spend runs absent from orchestration ledger | FIXED AND TESTED |
| DEF-0002 | Parenthetical provision references (2.1.1R) | FIXED AND TESTED |
| DEF-0003 | Batch accuracy conflated bindingNature under consultation | FIXED AND TESTED |
| DEF-0004 | Quotation accuracy presence-only | FIXED AND TESTED |
| DEF-0005 | Nested runAs → post-batch spend 401 | FIXED AND TESTED |
| DEF-0006 | SEC-DB-002 fixture `created_by_user_id` | FIXED AND TESTED |
| DEF-0007 | SEC-DB-003 hosted restricted-role proof | BLOCKED — EXTERNAL DEPENDENCY |
| DEF-0008 | PS22 spend exceeds $2.35 for full 242 | BLOCKED — SPENDING AUTHORISATION |
| DEF-0009 | PS26 operative without live structured AI recall | READY FOR HOSTED VALIDATION |
| DEF-0010 | Historical paid extraction failures | FIXED AND TESTED |
| DEF-0011 | PS22 batch-0 four classification discrepancies | TESTED AND PASSED |
| DEF-0012 | PS22/9 misidentified as CP22/9 in docs | FIXED AND TESTED |
| DEF-0013 | Analyzer treated PS22/9 as consultation | FIXED AND TESTED |
| DEF-0014 | 97 extractions used consultationPreserved guards | FAILED (re-assessment required) |
| DEF-0015 | RI_LAB_MAX_PROVISIONS_PER_BATCH env bypass | FIXED AND TESTED |
| DEF-0016 | Staging P2 browser regression | TESTED AND PASSED |
| DEF-0017 | Local design-lab browser suites (×3) | NOT EXECUTED — REQUIRES LOCAL DESIGN-LAB SERVER |
| DEF-0018 | PS22/9 classifier on staging runtime | IMPLEMENTED — AWAITING STAGING DEPLOY |

Status totals: **18** (previously reported rollup omitted **NOT EXECUTED** and **IMPLEMENTED — AWAITING DEPLOY** classes).

---

## 9. Readiness to resume remaining 145 provisions

| Prerequisite | Status |
|--------------|--------|
| Source identity correct | **Yes** |
| Classifier fix in staging runtime | **After consolidated deploy of this commit** |
| Legal re-assessment of 97 under corrected context | **Not started** (required before treating extractions as binding) |
| Spend authorisation for batches 2+ | **Blocked** without ceiling approval (~$2.73 projected full completion) |
| Paid extraction in this instruction | **Prohibited** |

**Recommendation:** Complete publication-context re-assessment design for the 97, deploy classifier fix, obtain spend approval, then resume batches **2–8** within ceiling — not before.

---

## 10. Production readiness decision

**NO-GO**

Reasons: PS22 legal re-assessment incomplete; historical consultation guards on 97 runs; SEC-DB-003 hosted proof blocked; PS26 live recall outstanding; local browser modules not executed; production deploy explicitly out of scope.

---

## Commits and deployment

- Prior accepted RC: **`441a982`** (staging validated for remediation tranche).
- This closure tranche: PS22/9 identity + classifier fix + evidence — commit and **one** consolidated staging deploy per policy (post-local gates + build PASS).