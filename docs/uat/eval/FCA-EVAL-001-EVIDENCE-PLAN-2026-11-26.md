# FCA-EVAL-001 (CONC 7.20.1R) — evidence capture plan (2026-11-26)

**Status: prepared, NOT executed.** No provider call has been made. Live execution needs explicit authorisation.

## Purpose

The pilot produces two different kinds of result and they must never be merged:

| Kind | Question | Who decides | Source |
| --- | --- | --- | --- |
| **Technical success** | Did the run complete, return valid structured JSON, cite sections that exist, stay inside the spend guard, and create draft records only? | Automated checks | `ai_analysis_runs`, `ai_analysis_citations`, `lab_ai_spend_reservations` |
| **Regulatory accuracy** | Are the extracted obligations, applicability, risks, controls and assurance recommendations correct against the FCA Handbook text? | Two independent human experts using the rubric in `FCA-REGULATORY-EVAL-CASES-2026-11-25.md` | Expert scoring sheet, not model output |

A run that is technically successful has **not** been shown to be accurate. The evidence file records `regulatoryAccuracy.status = NOT_ASSESSED` until both experts have scored it. Do not state that live AI accuracy has passed on technical evidence alone.

## The twenty evidence items

| # | Item | Collected from |
| --- | --- | --- |
| 1 | Publication and source | `regulatory_publications`, `regulatory_publication_versions` |
| 2 | Extracted obligations | UC-RI-005 run, obligation rows created in the window |
| 3 | Exact citations | `ai_analysis_citations` (claim text, source section ids, citation and grounding status) |
| 4 | Impact assessment | UC-RI-004 run and `impact_assessments` |
| 5 | Risks | UC-RI-006 run and `risks` |
| 6 | Existing-risk matches | UC-RI-006 structured output (catalogue match versus new proposal) |
| 7 | Control mappings | UC-RI-007 run and `controls` |
| 8 | Control gap analysis | UC-RI-007 structured output |
| 9 | Assurance recommendations | UC-RI-008 run and `assurance_reviews` |
| 10 | Supporting evidence and uncertainties | structured output of each completed run |
| 11 | Structured-output validation results | `execution_status` and `error_code` per run |
| 12 | Human review decisions | `ai_analysis_reviews` |
| 13 | Model identifier | run `model`, ledger `model`, provider-reported response model |
| 14 | Input and output tokens | ledger `input_tokens`, `output_tokens` |
| 15 | Cache usage | ledger cache write (5m, 1h) and cache read tokens |
| 16 | Latency | run `latency_ms` |
| 17 | Reserved cost | ledger `reserve_usd` |
| 18 | Settled estimated cost | ledger `actual_usd`, `usage_known`, account totals |
| 19 | Database relationships | run ids and downstream row counts |
| 20 | Full audit history | `workflow_events` for the runs, plus any recoveries |

## Collector

`apps/platform/scripts/staging/fca-eval-001-evidence.mjs`

```
node scripts/staging/fca-eval-001-evidence.mjs --self-test
node scripts/staging/fca-eval-001-evidence.mjs --publication-id <uuid> [--scope forgeniq-lab-anthropic] [--out <dir>]
```

* Read-only: it runs inside `begin read only` and rolls back. It makes no provider call.
* Connection comes from `RI_LAB_SPEND_DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_URL` or `DATABASE_URL`. The URL is never printed.
* Writes `docs/uat/evidence/fca-eval-001/<timestamp>/EVIDENCE.json`. Each item is `PRESENT` or `ABSENT` with its detail. `collectionErrors` lists any query that failed, so a missing item is never silently reported as present.
* Bulky grounding payloads are stripped from stored structured output. The model output, validation fields and provider metadata are kept.
* The column names it queries were checked against the staging schema on 2026-11-26 (read-only). The ledger columns added by `20261126120000_lab_ai_spend_usage_categories_and_recovery_v2` exist only after that migration is applied.

## Expert review procedure (after an authorised run)

1. Run the collector and archive `EVIDENCE.json`.
2. Two reviewers who did not tune the prompts score the outputs 0–2 on the ten rubric dimensions, against independently verified FCA text. Citations and obligation extraction count double.
3. Hard fails: hallucinated rule numbers; citations without a backing section; FCA requirements not present in the source; AI output treated as an approved record.
4. Pass requires a weighted mean of at least 1.6, no hard fail, and agreement between both reviewers.
5. Record the outcome next to the technical result. Only then may regulatory accuracy be reported, and only for this one case.

## Controls to confirm in the evidence

* Every record created by the run is a draft; nothing is approved or opened without a human.
* The reviewer is not the maker (maker-checker).
* Reserved cost is at or above settled cost for each call, and the account total is within $0.75 and 8 requests.
* No record was invented: every obligation cites a section id present in the publication.
* No effectiveness conclusion, fabricated test result or lifecycle closure appears.
