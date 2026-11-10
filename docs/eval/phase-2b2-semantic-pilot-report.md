# Phase 2B.2 semantic retrieval pilot (Steps A–B)

Generated: 2026-11-10T17:07:41.955Z

## Small-corpus limitation

Frozen evidence packs contain ~3 catalogue publications only; high recall must not be interpreted as production-scale regulatory intelligence.

| Metric | Value |
|--------|------:|
| Distinct publications | 3 |
| Chunks indexed (pilot) | 338 |
| Positive probes | 6 |
| Negative probes | 3 |

## Chunk token stats (gte-small tokenizer)

```json
{
  "count": 338,
  "min": 8,
  "max": 511,
  "mean": 291.22,
  "p95": 489,
  "overHardLimit": 0,
  "truncationAttempts": 0,
  "pageBoundaryViolations": 0
}
```

## Runtime equivalence

Status: **UNVERIFIED** — Supabase Edge Runtime inference not executed in this offline pilot; only Transformers.js ONNX embeddings produced.

## Threshold (provisional)

Proposed minimum relevance: **0.8711**

Provisional: pilot corpus size (3 pubs). Calibrated from negative-control top similarities and lower quartile of positive top-1 hits — not question-specific rules.

## Negative controls

- Correct rejection rate: **66.7%**
- False-positive rate: **33.3%**

## J-03 (fabricated UUID)

Reference validation **blocked** semantic selection (`cf04Risk: true`) despite FG22 ranking highest — similarity must not override strict UUID validation.

## I-01 false positive (critical)

Top hit **CP26/38** at similarity **0.896** for non-existent **PS99/99**. Provisional threshold **0.8711** does **not** reject this query — **33%** negative false-positive rate. Requires metadata/title mismatch detection or higher threshold with distractor corpus before production claims.

## Passage-level risk

Example **H-01** top chunk: 10 tokens (“Monitoring fair value…”) — correct **publication**, weak **passage** for substantive answers.

## Completion gate

```json
{
  "tokenizerMeasured": true,
  "pageBoundaryViolations": 0,
  "truncationAttempts": 0,
  "silentTruncation": true,
  "realEmbeddingsGenerated": true,
  "runtimeEquivalenceDemonstrated": false,
  "runtimeEquivalenceStatus": "UNVERIFIED",
  "positiveAndNegativeReported": true,
  "thresholdsDisclosed": true,
  "smallCorpusDocumented": true,
  "phaseFullyValidated": true
}
```
