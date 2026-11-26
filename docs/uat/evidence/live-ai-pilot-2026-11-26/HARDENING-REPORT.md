# FCA-EVAL-001 — pilot findings and regulatory accuracy hardening

Date: 2026-11-26. Paid AI calls made in this tranche: **0**. Paid AI posture: unchanged (disabled).
Historical pilot outputs: preserved byte-for-byte (see `ORIGINALS-MANIFEST.json`, 24 files, SHA-256, line-ending normalised; verified against the commits made at pilot time).

## 1. Root cause of each finding

| # | Finding | Root cause |
|---|---|---|
| 1 | Provision labelled consultation / proposal | The publication analyser classified the whole PDF by its dominant front matter (consultation feedback, policy statement), then Stage 1 context carried `documentType: consultation` and `consultationPreserved: true`. The made instrument inside the PDF (FCA 2026/2) was never analysed as a separate legal instrument. Document type, draft/final status and provision-level legal status were conflated in one field. |
| 2 | `effectiveDate` null | Commencement was only read from the model. The instrument states commencement in a Commencement paragraph (clause H: all other parts 15 July 2026, p.63) and an annex-to-module table; nothing parsed those. |
| 3 | Quotation covered limb (1) only; limbs (2)(b) and (3) lost | The authoritative excerpt supplied to the model began at a cross-reference on p.94 ("CONC 7.20.1R or ...") rather than where the rule is set out, and the guard checked only that the quotation appeared in the source, not which limb it covered. Downstream records inherited only (2)(a). |
| 4 | Stage 2–5 citations weak | Stages 3–5 return the sentence under `claim` but mappers read only `text` (text persisted as null). Citations carried only internal section ids; no validation against regulatory evidence existed. |
| 5 | Risk ratings unjustified | The risk mapper defaulted ratings (residual MEDIUM) and accepted an inherent rating with no rationale; no concept of "unassessed". |
| 6 | Control did not address the requirement | The control prompt had no requirement map, so the model proposed an internal detection/reconciliation control; the mapper kept only `proposals[0]` and no coverage check existed. |
| 7 | Assurance truncated | **Mapper**, not the model, provider token budget, JSON parse, DB column or UI: `assurance-plan-mapper` sliced the procedure to 1500 characters and evidence to 1000, and coerced arrays to comma strings. Persistence, response mapping and Design Lab rendering were traced and cleared. |

## 2. Corrections

- New `core/instrument-legal-status.mjs`: separates source document type, draft/final instrument, provision-level legal status, commencement clauses, annex→module map, part headings, transitional references. Unresolvable cases return explicit unresolved states rather than guesses.
- `regulatory-pdf-analysis.mjs` (analyzer v2): instrument-aware classification; a genuine consultation is never promoted (draft/consultation instruments stay `PROPOSED`).
- `provision-legal-status.mjs`, guard changes: provision-level legal status, verified effective date replaces or removes any model date.
- `provision-breakdown.mjs`: limb-level breakdown; applicability and definition limbs are not standalone obligations; quotation limb-coverage check routes applicability-only quotations to EXCEPTION (`_limbCoverageGuard`).
- `deterministic-provision-candidates.mjs`: excerpt prefers where the provision is set out over cross-references.
- `lifecycle-evidence.mjs`: regulatory evidence pack; `validateStageClaims` rejects unknown sections, quotations not in the verified source and provision references not in evidence; internal-only citations are labelled `internal_only`, never regulatory-verified.
- `risk-rating-policy.mjs`: inherent shown as provisional only with a documented rationale (≥40 chars); residual UNASSESSED without control-effectiveness evidence.
- `control-coverage.mjs`: requirement categories (detection, notification, information completeness, timeliness, monitoring, evidence retention); coverage justification; proposed controls are never presented as existing.
- Mappers: `claim`→`text`, all proposals retained, no truncation, arrays preserved, frequency persisted, raw provider output retained for live runs.
- CI: `harness.mjs` embedded-Postgres readiness race (run 32) fixed.

## 3. Classification result (CONC 7.20.1R)

Document type: policy statement containing a made instrument (FCA 2026/2). Instrument status: **made / final**. Provision legal status: **final rule (R)**, binding. Consultation material in the same PDF remains classified as consultation.

## 4. Effective-date verification

`2026-07-15`, basis clause H ("All other parts of this instrument come into force on 15 July 2026"), p.63, CONC = Annex F. Publication date and commencement are separate fields. No provision-specific transitional text references 7.20.1R; flagged for expert confirmation (in-flight agreements, temporary-permission firms). Persisted additively on staging obligation `dc63a70a-d795-430a-99bc-34a5e73896c5` (`effective_date` = 2026-07-15 and metadata `commencement`, `provisionBreakdown`, `transitionalScan`, `commencementBackfill`); existing metadata (`modelBindingLabels`, `sourceQuotation`, classification) untouched; payload and SQL in `saved-outputs/`.

## 5. Obligation breakdown

| Limb | Kind | Standalone obligation |
|---|---|---|
| (1) | applicability condition | No |
| (2) | lead-in (duty and timing "as soon as possible") | No (inherited by children) |
| (2)(a) | mandatory notification (i, ii content) | Yes |
| (2)(b) | mandatory information (i–iv content) | Yes |
| (3) | information provided together | Yes |
| (4) | definition of "payment" | No |

## 6–9. Citations, risk, controls, assurance

See section 2. Saved-output evaluation (deterministic, no AI): 4 correct, 4 incorrect, 4 missing, 2 unsupported, 7 insufficient-citation, 3 unjustified-rating, 5 control-gap and 4 assurance findings (`EVALUATION-DETERMINISTIC.json`). The mock-provider regression suite now fails if any of these regress.

## 10. Regression results

- `acceptance-ri-pilot-accuracy-hardening.mjs`: 80/80 checks (registered in the QA catalogue as `RI-PILOT-ACCURACY-HARDENING`, gate `ci`).
- `npm run qa` (ci): 30 passed, 0 failed, 0 blocked. `tsc --noEmit`: clean. Related legacy acceptance tests (PS22 PDF analysis, normalise-output, PS26/1 runtime deps, PDF ranking): pass.

## Outstanding expert-review questions

1. What period satisfies "as soon as possible" in 7.20.1R(2)?
2. What is "sufficient information … to understand" for (2)(b)?
3. Scope of "adverse consequences", the firm's "likely" consequences judgement, and "where relevant" mitigation steps.
4. Transitional / in-flight agreement and temporary-permission applicability to CONC 7.20.1R.
5. Impact materiality/complexity are still heuristics (model confidence and dimension count). Flagged by the evaluator, not changed.

## Known limitation

Raw provider output for stages 3–5 was not persisted during the pilot, so any extra control proposals the model returned cannot be proven. Raw output is now retained for live runs.
