# Phase 2B.2 Batch B2 — Completion Report

Generated: 2026-11-10 (staging-only; no push/deploy)

## 1. Approved source identities and URLs

| # | Reference | URL |
|---|-----------|-----|
| 1 | PS22/9 | https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty |
| 2 | FG21/1 | https://www.fca.org.uk/publications/finalised-guidance/guidance-firms-fair-treatment-vulnerable-customers |
| 3 | FG24/6 | https://www.fca.org.uk/publications/finalised-guidance/fg24-6-guidance-firms-enables-risk-based-approach-payments |
| 4 | Wholesale Insights 3 | https://www.fca.org.uk/publications/multi-firm-reviews/wholesale-banks-supervision-insights-3-autumn-2026 |
| 5 | Defence SMEs banking | https://www.fca.org.uk/publications/multi-firm-reviews/defence-smes-access-banking-services |
| 6 | Access to cash 2024 H2 | https://www.fca.org.uk/data/access-cash-coverage-uk-2024-h2 |

Item 7 (Consumer Duty hub) was **not** ingested.

## 2. Staging preflight

- Branch: `feature/ask-ri-v2-evaluation-baseline`
- Staging project: `lhgzdicffkhaaykzthep`
- Production isolation guards: PASS
- Sequential processing, no parallel FCA RSS catalogue pulls during batch snapshots

## 3–4. Ingest outcomes

- **Ingested:** all 6 approved publications (`overall: PASS` in `phase-2b2-b2-ingest-report.json`)
- **Failed/skipped:** none

## 5–7. Extraction revision IDs and PDF coverage

| Publication | HTML revision | PDF revision (if required) | PDF pages |
|-------------|---------------|---------------------------|-----------|
| PS22/9 (`7a73ac4c-…`) | `c76f5887-9e62-4b3b-a672-9fe9ceabe499` | `33d01f14-f633-4708-94b3-3aa26755417c` | 161 |
| FG21/1 (`a784dcfc-…`) | `e2006b3a-3d84-46ab-a6f1-e6c5740a1cf1` | `2c2922b7-73fc-4454-9fc3-e2b7951808e9` | 57 |
| FG24/6 (`ec168f48-…`) | `85297be5-cd30-40ce-a812-f92ec8197ec0` | `5138fabf-983f-4694-81d4-0336df6f4e78` | 17 |
| Wholesale (`caeb51af-…`) | `e86652e9-bd87-41f5-9417-ca9ba23fd93f` | n/a | n/a |
| Defence SMEs (`5f4c6f09-…`) | `93ea9d73-9ef4-4bb6-906b-dde1ac84d5f2` | n/a | n/a |
| Cash 2024 H2 (`0d3468e6-…`) | `d7e2f6e1-1fd3-4f59-b674-28bc1ff729db` | n/a (data HTML) | n/a |

Primary PDF URLs verified at ingest: `ps22-9.pdf`, `fg21-1.pdf`, `fg24-6.pdf`.

## 8. Integrity hashes (samples)

See per-publication `rawSha256`, `derivedFingerprint`, and PDF `contentSha256` in `docs/eval/phase-2b2-b2-ingest-report.json` and mixed export packs under `docs/eval/authentic-corpus-b2-2b2/`.

## 9. Full-text export reconciliation

- Corpus directory: `docs/eval/authentic-corpus-b2-2b2/`
- 28 pack files (core + B1 copies + 6 B2 mixed packs)
- Post-normalize: **28/28** full export; **2,594** source blocks indexed offline (`phase-2b2-b2-retrieval-report.json` → `evidenceExportAuditSummary`)
- Frozen Phase 2A packs unchanged under `docs/eval/evidence-packs/`

## 10–11. Corpus scale

- **Verified publications in offline B2 corpus:** 14 distinct publication IDs
- **Indexed chunks (B2 corpus):** 1,179 (max 450 tokens; 0 over index limit)

## 12–15. Development retrieval (B2 corpus, probes v3)

| Category | Result |
|----------|--------|
| B1 positives (8) | 8/8 Recall@1 |
| B2 positives (12) | 8/12 Recall@1 |
| Wholesale positive | 1/1 |
| Access-to-cash temporal (5) | 3/5 (1 FN on multi-period compare) |
| Near-miss negatives | 1/3 abstain; **2 FP** (unchanged limitation; no threshold tuning) |
| Unrelated authority | 2/2 abstain |
| Invalid reference | 1/1 abstain |

Frozen suite on corpora: Original 6/6, B1 6/6, B2 6/6 Recall@1 (eval suite v2.1).

## 16. Provenance / identity issues

- Staging catalogue rows for FG21/1 (and similar) had stale titles vs live FCA HTML; **reconciled from live source** before extraction.
- Historical publications not in RSS feed were catalogued via **direct canonical landing ingest** (not RSS `--only-url` scan).
- Access-to-cash 2024 H2 HTML signals linked `ps24-8.pdf` as a non-primary attachment; batch did **not** require PDF for this data publication.

## 17. Local Git commit

**SHA:** `12d9adb` on `feature/ask-ri-v2-evaluation-baseline` (no push).

## 18. Recommendation

**Defer pgvector integration** until near-miss false positives and B2 publication discovery gaps are addressed with a grounded reasoner. **Optional next step:** another small ingestion batch only if additional distractor publications are required for eval; otherwise invest in reasoner/eval hardening before staging embeddings.
