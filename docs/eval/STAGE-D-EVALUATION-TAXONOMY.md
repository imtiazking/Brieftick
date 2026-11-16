# Evaluation outcome taxonomy

| Layer | Examples | Purpose |
|-------|----------|---------|
| **Suite ideal** | `expectedIdealResult.outcomeClassification` | SME-authored target — not auto-updated |
| **Application policy status** | `ANSWERED`, `PARTIAL_ANSWER`, `INSUFFICIENT_EVIDENCE`, `BLOCKED` | Stage C `resolveFinalRegulatoryStatus` after verification |
| **Scorer outcome** | `FAIL`, `CORRECT_INSUFFICIENT_EVIDENCE`, `RETRIEVAL_PASS` | `scoreEvalCase` rubric D01–D11 |
| **Coverage** | `questionCoverage` KNOWN/UNKNOWN, `completeness` | `assess-evidence-question-coverage.mjs` — not from model alone |

## EVAL-I-01

`evidenceAvailability: NOT_IN_SUITE` means the **regulatory source is absent from the authorised eval corpus** (fabricated PS99/99). The case **is included** in suite v2.1 as a negative control.

## EVAL-B-03

`NOT_IN_SUITE` for **COBS handbook** — correct abstention when corpus lacks COBS; unrelated retrieved chunks do not establish coverage. Class **A** (correct abstention), not incorrect refusal.