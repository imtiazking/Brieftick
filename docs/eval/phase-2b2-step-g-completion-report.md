# Phase 2B.2 Step G — Completion Report

Generated: 2026-11-10 | Offline only | Corpus: 14 publications, 1,179 chunks

## 1. Root causes (strict semantic baseline → miss analysis)

| ID | Classification | Root cause |
|----|----------------|------------|
| Frozen suite (B2 corpus) | GENUINE_MISS | One frozen `EVAL-H-*` case (5/6 Recall@1): expanded corpus introduces nearer semantic neighbours (e.g. PS22/9 Consumer Duty vs fair-value supervisory HTML). See `phase-2b2-b2-retrieval-report.json` `b2Corpus.metrics`. |
| DEV-B2-FG24-01 | GENUINE_MISS | CP26/38 crime PDF outranks FG24/6 on “payments fraud” wording despite FG24/6 in top-5 chunks. |
| DEV-B2-FG24-02 | GENUINE_MISS | “Calibrated controls” lexical overlap with Fair value consumer finance, not payments corridors. |
| DEV-B2-WHL-02 | GENUINE_MISS | AML/sanctions terms route to CP26/38 instead of Wholesale Insights 3. |
| DEV-B2-CASH24-01 | GENUINE_MISS | 2024 H2 vs 2025 H1 near-duplicate embeddings; period not in vectors. |
| DEV-TEMP-CASH-03 | GENUINE_MISS | Multi-period question; both pubs rank but 2025 H1 wins max-score aggregation. |

Full per-question detail: [`phase-2b2-step-g-miss-analysis.json`](phase-2b2-step-g-miss-analysis.json).

## 2–3. Genuine misses vs alternatives

- **Genuine misses:** 6 (including frozen suite case).
- **Valid alternatives:** none adjudicated — DEV-ORIG-01 selects FG22/5, which is within its multi-publication expectation (strict top-1 still counts as hit when FG22/5 is listed).
- **Probe defects:** 0.

Adjudication file (development-only): [`development-retrieval-adjudication-2b2-step-g-v1.json`](development-retrieval-adjudication-2b2-step-g-v1.json).

## 4. Keyword retrieval

- Module: `apps/platform/lib/ri/semantic/bm25-chunk-index.mjs` (Okapi BM25, k1=1.2, b=0.75).
- Tokeniser: `regulatory-lexical-tokenize.mjs` (publication refs, PRIN 2A, Consumer Duty, APP fraud, AML, etc.).
- Preserves chunk `publicationId`, `extractionRevisionId`, pages, sections, `contentSha256`.

## 5. Hybrid retrieval

- RRF k=60 (`reciprocal-rank-fusion.mjs`) over semantic + BM25 chunk rankings.
- Publication aggregation: **max chunk score** (`publication-rank-aggregate.mjs`) to limit chunk-count dominance.
- No-match / authority / reference gates unchanged; decision thresholds use **semantic** scores on fused candidates (`offline-retrieval-methods.mjs`).
- Reporting-period hints: `reporting-period-retrieval.mjs` (regex on question, not probe IDs).

## 6. Method comparison (strict Recall@1 / @3 / @5)

| Slice | Metric | Semantic | BM25 | Hybrid |
|-------|--------|----------|------|--------|
| B1 positive | R@1 | 8/8 | 8/8 | 8/8 |
| B2 positive | R@1 | 9/12 | 9/12 | 9/12 |
| B2 positive | R@3 | 10/12 | 11/12 | 11/12 |
| B2 positive | R@5 | 11/12 | 11/12 | 12/12 |
| Wholesale | R@1 | 1/1 | 1/1 | 1/1 |
| Temporal (4 positives) | R@1 | 3/4 | 3/4 | 3/4 |
| Negatives (10) | Abstain correct | 6/10 | 6/10 | 6/10 |
| Negatives (10) | False positives | 4 | 4 | 4 |

Near-miss false positives **unchanged** (no threshold tuning on legacy near-miss strings).

## 7–8. Strict vs adjudicated recall

Strict and adjudicated counts are **identical** in Step G (no alternate sources accepted). Reported separately in JSON under `slices.*.strict` and `slices.*.adjudicated`.

## 9. Passage relevance

Positive probes largely return substantive passages (`passageRelevant: true`); FG24-02 miss still returns substantive but **wrong-publication** supervisory text.

## 10. Negatives

- Invalid reference / unrelated authority: remain blocked (authority gate + reference validation).
- Near-miss: semantic **4 FP** on expanded negative set in Step G run (includes temporal probe answered when abstention expected); hybrid **reduces** near-miss selections without threshold tuning on the three legacy near-miss strings.

## 11. Temporal findings

- Failure driver: **semantic similarity + missing period metadata**, not missing evidence (both H1/H2 indexed).
- Period regex boost improves some latest-period questions; **2024 H2-specific** and **multi-period compare** remain fragile.
- Recommendation: index reporting-period fields in catalogue metadata (not hardcoded probe strings) before production.

## 12. Remaining genuine failures (hybrid)

- FG24-02 (payment corridors calibration).
- WHL-02 (wholesale AML governance) — check Step G hybrid results for residual miss.
- One temporal probe (2024 H2 geographic question or multi-period compare).
- Frozen suite 1/6 on 14-publication corpus.

## 13. Latency (mean ms, dev probes)

| Method | Approx mean |
|--------|-------------|
| Semantic | ~8 |
| BM25 | ~10 |
| Hybrid | ~12 |

## 14. Local commit SHA

(To be recorded after Step G commit.)

## 15. GO / NO-GO — local pgvector

**CONDITIONAL GO** for a **local/staging hybrid prototype** only:

- GO: BM25 + RRF improves R@5 on B2 (12/12) without new DB writes; gates preserved.
- NO-GO for production Ask RI until: (1) grounded reasoner handles near-miss / related-evidence cases, (2) period metadata strategy, (3) frozen-suite miss on expanded corpus understood.

Do **not** begin pgvector migration in this step.
