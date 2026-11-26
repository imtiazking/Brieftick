# FCA-EVAL-001 — first live five-stage AI regulatory pilot (2026-11-26)

Staging only (`forgeniq-platform-staging`, Supabase `forgeniq-ri-staging`). Provider Anthropic, requested model `claude-sonnet-5-5`, **returned model `claude-sonnet-5-5`** on all five requests. Reference provision FCA CONC 7.20.1R (PS26/1, FCA 2026/2, PDF pp.94–95). No retries, no fixture substitution, no production deployment.

## Result

| Stage | Live model executed | Output validated | Regulatory accuracy | Cost (USD) |
|---|---|---|---|---|
| 1 UC-RI-005 obligation extraction | Yes (`req_011ChRRDDiGUT2sPhaK3PYWv`) | Yes — schema `ObligationExtractionResult`, citation and quotation verified against independent FCA PDF text | NOT_ASSESSED (preliminary: classification R and provision reference match the reference; binding nature and effective date wrong) | 0.018702 |
| 2 UC-RI-004 impact | Yes (`req_011ChRRasTEKWbF9NdRT3AZb`) | Yes — persisted as DRAFT, labelled `uat_authorised`, confidence 55 | NOT_ASSESSED | 0.013340 |
| 3 UC-RI-006 risk | Yes (`req_011ChRRiKVLLGDW6sg3GfcXn`) | Yes — DRAFT risk, no existing risk invented | NOT_ASSESSED | 0.012972 |
| 4 UC-RI-007 control | Yes (`req_011ChRRnAq3Vv9qpmNh225xa`) | Yes — DRAFT control, `NOT_TESTED`, confidence 42 | NOT_ASSESSED | 0.014208 |
| 5 UC-RI-008 assurance | Yes (`req_011ChRRpvBZbeaU2Zteg6iBb`) | Yes — plan only, result `NOT_TESTED` | NOT_ASSESSED | 0.014254 |

Totals: **5 requests (limit 8), 8,348 input tokens, 5,678 output tokens, 0 cache tokens, $0.073476 settled (ceiling $0.75), remaining budget $0.676524 / 3 requests.** Ledger: 5 SETTLED reservations, 0 open, 0 recoveries, account `request_count` 5 / `settled_usd` 0.073476 / `reserved_usd` 0. Provider latency 6.3 / 9.4 / 7.3 / 8.6 / 10.9 s. Detail: `ledger-reconciliation.json`.

## Records (all labelled `uat_authorised` / synthetic, no genuine obligation approved)

| Record | Id |
|---|---|
| Change | `7d7e7712-ee1e-45fa-b1be-54b19f2ba2f8` |
| AI analysis run (stage 1) | `5609228c-be99-4f98-a14b-8c38122bbd5a` |
| Finding review | `94e48c1e-985d-42d2-ade8-c4c400a98b8b` |
| Obligation (OPEN) | `dc63a70a-d795-430a-99bc-34a5e73896c5` |
| Impact assessment (APPROVED) | `6a40d4b2-2c07-4124-9651-a67d194e98c2` |
| Risk (APPROVED) | `c3476126-ae8b-48e0-b523-4a86f3d65301` |
| Control (ACTIVE, effectiveness NOT_TESTED) | `cfc87ee5-1894-4627-841b-6e22a084d7c9` |
| Assurance plan (TESTING_READY, result NOT_TESTED) | `802c3e80-8e19-477c-b06b-1251da7368aa` |

Persistence: +1 each in `ai_analysis_runs` 29→30, `regulatory_changes` 99→100, `regulatory_obligations` 38→39, `impact_assessments` 60→61, `risks` 30→31, `controls` 29→30, `assurance_reviews` 6→7, `workflow_events` 728→759 (31 new audit events). No pre-existing record changed.

## Human governance (real app APIs, maker-checker)

- Stage 1 review: persona B (REVIEWER) via the finding-review API. The AI quotation covered only the 7.20.1R(1) applicability limb, so the finding was routed to the exception path (`provision_duty_language_unconfirmed`). B converted it using a verbatim p.95 quotation of 7.20.1R(2)(a), checked against the independent PDF text (hash matches the staged version). The decision is recorded as a synthetic UAT decision, not a professional judgement.
- Obligation, impact, risk, control and assurance plan: A (maker) submitted, C (independent checker) approved. A, B and C were never the same person for a submit/approve pair.
- Stages 2–5 approvals ran the next live stage as designed. Assurance approval ran no AI. No test recorded, no exception accepted, lifecycle not closed.
- Everything requiring expert judgement is **PENDING_HUMAN_REVIEW**.

## Preliminary deterministic accuracy (not a formal regulatory assessment)

Reference: `docs/eval/FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json` (7.20.1R = binding requirement, `R` marker in the made instrument, commencement 2026-07-15) and the FCA PDF text.

**Stage 1**
- Correct: classification `R`; provision reference `CONC 7.20.1R`; the claim text matches 7.20.1R(2)–(3); the applicability note (capital repayments only, charges excluded) matches 7.20.1R(4).
- Quotation verification: the AI `sourceQuotation` (7.20.1R(1)) is verbatim on PDF p.94. No fabricated text found.
- **Defect A — wrong binding nature.** The model and guard returned `bindingNature = consultation_proposal` and wrote "consultation-phase document … no published final rules". The reference says binding requirement. Root cause is in our grounding, not the model: `_forgeniqPublicationRegulatoryContext` for this publication has `documentType: consultation`, `legalInstrumentText: false`, `isFinalisedGuidance: false`, although the publication type is `policy_statement_with_instrument` and the instrument pages 61+ are selected. This pushed the finding to the exception route.
- **Gap B — effective date null** although the reference gives 2026-07-15.
- **Gap C — the quoted evidence was the applicability limb, not the duty.** The operative duty is in (2). Reviewer correction was required.
- Confidence 55; `insufficientEvidence` false.

**Stage 2**
- No organisational facts invented. The output says no inventory was consulted. All four claims are hedged ("may need"), and one is explicitly flagged as an inference.
- Weakness: the `citations` array holds section ids only (`OBL-1`); `citation`, `sourceQuotation` and `provisionReference` are null, so claims are not traceable to a quotation.
- Materiality LOW alongside implementation complexity HIGH for a binding rule is app-derived and looks inconsistent; business-area flags are a generic template, not analysis.

**Stage 3**
- The model did not invent existing risks. It stated that no tenant risk was relevant and proposed a new one.
- Inherent High / residual Medium were assigned without any control or evidence. This is an unsupported assertion pending expert validation.
- The description repeats "excerpt truncated". That comes from my shortened statement quotation, not a model fault.

**Stage 4**
- Confidence 42, the lowest. Effectiveness and testing status stay `NOT_TESTED`, so no control was declared effective. Status `ACTIVE` after approval is lifecycle state, not effectiveness, but is easy to misread.
- The proposed control (automated daily reconciliation) is specific design the model supplied without evidence; it is labelled "requires human confirmation".
- Relevance: it addresses detection of a missed payment, not the notification timing or content that 7.20.1R(2) requires. That is a coverage gap.

**Stage 5**
- No tests, evidence or results fabricated; evidence is a list of what to obtain.
- **Defect D — plan `notes` truncated mid-word** ("Review open and ageing exceptions for esc") by a field length limit.

## Unresolved regulatory questions
1. Does 7.20.1R(2)–(4) need decomposing into separate obligations (notify limb, information limb, "together" limb)? One synthetic obligation was created from (2)(a)(i)–(ii) only.
2. Confirm commencement (2026-07-15) and the transitional position for in-flight agreements.
3. Who owns the notification duty in the target organisation model (needed before any control is relied on).

## Requirements before business acceptance
1. Fix Defect A (publication regulatory context for policy statements with instruments) and re-test deterministically with fixtures before any further paid run.
2. Populate effective date from the instrument commencement data (Gap B).
3. Carry quotations and provision references into stage 2–5 citations.
4. Remove the `notes` truncation (Defect D); consider a "ready for testing" label distinct from `ACTIVE`.
5. Expert regulatory review of all five drafts; no formal accuracy score until then.
6. Decision on any further paid evaluation: not authorised under this pilot.

## Ledger and configuration restore
See `RESTORE.md`.
