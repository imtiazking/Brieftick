# Phase 2B.2 Step C — retrieval safety and expanded corpus

Generated: 2026-11-10T17:19:25.857Z

## Embedding runtime (local pilot)

```json
{
  "modelRepository": "Xenova/gte-small",
  "upstreamRepository": "thenlper/gte-small",
  "supabaseProductName": "Supabase/gte-small",
  "outputDimensions": 384,
  "pooling": "mean",
  "vectorNormalization": "l2",
  "onnxQuantization": "quantized (Transformers.js default)",
  "runtime": "node_transformers_js",
  "edgeRuntimeEquivalence": "UNVERIFIED",
  "note": "Local Transformers.js ONNX only; Supabase Edge equivalence not demonstrated in this step."
}
```

## Reference validation

```json
{
  "module": "publication-reference-validation.mjs",
  "scope": "offline_indexed_catalogue"
}
```

## Chunk statistics (original corpus)

```json
{
  "count": 317,
  "min": 9,
  "max": 511,
  "mean": 310.38,
  "p95": 490,
  "belowMinTarget": 13,
  "overHardLimit": 0,
  "shortChunkExceptions": 4,
  "truncationAttempts": 0,
  "pageBoundaryViolations": 0
}
```

## Chunk statistics (expanded corpus)

```json
{
  "count": 353,
  "min": 9,
  "max": 511,
  "mean": 281.63,
  "p95": 483,
  "belowMinTarget": 49,
  "overHardLimit": 0,
  "shortChunkExceptions": 4,
  "truncationAttempts": 0,
  "pageBoundaryViolations": 0
}
```

## EVAL-I-01

```json
{
  "correctlyRejected": true,
  "referenceValidation": {
    "hasExplicitReference": true,
    "resolutions": [
      {
        "ref": {
          "raw": "PS99/99",
          "normalized": "PS99/99",
          "kind": "PS"
        },
        "status": "not_in_offline_catalogue",
        "publicationId": null,
        "indexed": false,
        "message": "Identifier is not present in the authorised offline catalogue for this experiment (does not imply absence from the global regulatory catalogue)."
      },
      {
        "ref": {
          "phrase": "PS99/99"
        },
        "status": "title_not_in_offline_catalogue",
        "publicationId": null,
        "indexed": false,
        "message": "Quoted publication title does not match an entry in the offline catalogue."
      }
    ],
    "restrictToPublicationIds": null,
    "blockSemanticSelection": true,
    "abstainReason": "unresolved_explicit_publication_reference",
    "outcome": "abstain_unresolved_reference"
  },
  "noMatchReasons": [
    "unresolved_explicit_publication_reference"
  ],
  "topPublication": {
    "publicationId": "4d05b49b-a4a4-4101-8c87-7d3983315f25",
    "publicationTitle": "CP26/38 Financial Crime Guide updates",
    "maxSimilarity": 0.896068
  }
}
```

## EVAL-J-03

```json
{
  "correctlyRejected": true,
  "referenceValidation": {
    "hasExplicitReference": true,
    "resolutions": [
      {
        "ref": {
          "uuid": "00000000-0000-4000-8000-000000000001"
        },
        "status": "uuid_not_in_offline_catalogue",
        "publicationId": null,
        "indexed": false,
        "message": "Publication UUID is not present in the authorised offline catalogue (does not imply the UUID is globally invalid)."
      }
    ],
    "restrictToPublicationIds": null,
    "blockSemanticSelection": true,
    "abstainReason": "unresolved_explicit_publication_reference",
    "outcome": "abstain_unresolved_reference"
  },
  "noMatchReasons": [
    "unresolved_explicit_publication_reference"
  ],
  "semanticTop": {
    "publicationId": "a761cacc-8742-493d-b200-eb5d9a3ab884",
    "publicationTitle": "FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty",
    "maxSimilarity": 0.856487
  }
}
```

## EVAL-H-01 passage quality

```json
{
  "passageRelevant": true,
  "topChunk": {
    "similarity": 0.915116,
    "publicationId": "a761cacc-8742-493d-b200-eb5d9a3ab884",
    "title": "FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty",
    "page": 67,
    "modelTokenCount": 408,
    "substantive": true,
    "excerpt": "67 FG22/5Chapter 7Financial Conduct AuthorityFG22/5 Final non-Handbook Guidance for firms on the Consumer Dutyconsidered in their value assessments and should be able to provide evidence if we request"
  },
  "publicationRecallTop1": true
}
```

## Original vs expanded metrics

| Corpus | Distinct pubs | Chunks | Recall@1 | Recall@5 | Passage relevance | Neg. rejection | FP rate | Mean latency ms |
|--------|--------------:|-------:|---------:|---------:|------------------:|---------------:|--------:|----------------:|
| Original | 3 | 317 | 6/6 | 6/6 | 6/6 | 100.0% | 0.0% | 7.61 |
| Expanded | 21 | 353 | 6/6 | 6/6 | 6/6 | 100.0% | 0.0% | 6.72 |

## Completion gate

```json
{
  "pageBoundaryViolations": 0,
  "truncationAttempts": 0,
  "silentTruncation": true,
  "runtimeEquivalenceDemonstrated": false
}
```

## pgvector readiness

```json
{
  "recommendation": "defer_until_edge_equivalence_and_larger_labelled_corpus",
  "blockers": [
    "edge_runtime_embedding_equivalence_unverified",
    "staging_extraction_coverage_insufficient_for_production_catalogue"
  ]
}
```

## Remaining reliability risks

- Supabase Edge Runtime embedding equivalence remains **UNVERIFIED** (local ONNX only).
- Supplemental corpus uses catalogue metadata + short public fixture excerpts; only three staging publications have full extraction revisions.
- Provisional similarity threshold (0.8711) calibrated on six positives and three mandated negatives — not independently labelled.
- Semantic ranking still surfaces irrelevant publications on blocked queries (disclosed in per-case `rankedPublications`; selection is withheld).
- Handbook abstention uses explicit module detection; other out-of-catalogue domains without explicit references may still false-positive at scale.

## Supplemental corpus

- **18** additional staging catalogue publications exported under `docs/eval/supplemental-corpus-2b2/` (see `catalogue.json`).
- Composition mixes Consumer Duty, financial crime, consultation, crypto, data, and overseas regulatory distractors.
- `docs/eval/evidence-packs/` was not modified.
