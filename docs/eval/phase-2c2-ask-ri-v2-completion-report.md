# Phase 2C.2 — Ask RI V2 grounded reasoner (completion report)

**Date:** 2026-11-10  
**Status:** Implementation complete; **live Anthropic eval not executed in this environment** (no `ANTHROPIC_API_KEY`). Pipeline dry-run + offline acceptance passed.

---

## 1. Files created and modified

**New (reasoner core)**

- `apps/platform/lib/ri/reasoner/public-question-eligibility.mjs`
- `apps/platform/lib/ri/reasoner/evidence-chunk-v2.mjs`
- `apps/platform/lib/ri/reasoner/evidence-assembler.mjs`
- `apps/platform/lib/ri/reasoner/reasoner-output-schema.mjs`
- `apps/platform/lib/ri/reasoner/verify-claims.mjs`
- `apps/platform/lib/ri/reasoner/build-reasoner-prompt.mjs`
- `apps/platform/lib/ri/reasoner/invoke-anthropic-reasoner.mjs`
- `apps/platform/lib/ri/reasoner/anthropic-eval-budget.mjs`
- `apps/platform/lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs`
- `apps/platform/lib/ri/reasoner/render-verified-answer.mjs`
- `apps/platform/lib/ri/eval/run-eval-suite-v2.mjs`
- `apps/platform/scripts/run-ask-ri-v2-eval-2c2.mjs`
- `apps/platform/scripts/acceptance-ask-ri-v2-reasoner.mjs`

**Modified**

- `apps/platform/lib/ri/eval/eval-paths.mjs` — v2.1 suite + R2 baseline paths
- `apps/platform/lib/ri/semantic/offline-retrieval-methods.mjs` — `allRankedChunks` for evidence assembly
- `apps/platform/scripts/run-ask-ri-eval-suite.mjs` — `--engine=v2` entry (delegates to V2 runner)

**Reports (sanitised, local)**

- `docs/eval/phase-2c2-ask-ri-v2-eval-report.json` (dry-run)
- This document

**Design reference (pre-existing):** `docs/eval/phase-2c1-grounded-reasoner-design.md`

---

## 2. Selected Anthropic model

- **Configured default for V2 eval:** `claude-haiku-4-5` (override via `ASK_RI_V2_EVAL_MODEL` / `RI_ANTHROPIC_MODEL`)
- **Prototype only** — not production approval
- **Live run:** requires `RI_AI_EXECUTION_ENABLED=true` and `ANTHROPIC_API_KEY` (not present in agent shell; `.env.local` not loaded with a key for this session)

---

## 3. Eligibility-gate results

| Classification | Count (runnable v2.1 cases) |
|----------------|-------------------------------|
| `PUBLIC_REGULATORY_QUESTION` | 38 |
| `TENANT_CONTEXT_REQUIRED` | 7 |

Blocked IDs: `EVAL-F-01`…`F-05`, `EVAL-G-04`, `EVAL-I-03`.  
Operator held-out slots (`EVAL-H-90`…`99`) excluded from default suite run (not accessed).

---

## 4–5. Provider transmission counts

- **Eligible for provider (allowlist):** 38  
- **Blocked before Anthropic (fail-closed):** 7  
- **Additional pre-reasoner blocks (invalid/unindexed explicit refs, no API):** 6 (`EVAL-B-01`, `B-03`, `D-02`, `G-02`, `I-01`, `J-03`)

---

## 6. Evidence assembly statistics

- Corpus: `docs/eval/authentic-corpus-b2-2b2/` (14 publications, Step G hybrid retrieval)
- Defaults: target 14 chunks, max 16, max 6/publication, ~48k character budget
- Exclusions recorded per case in `v2Diagnostics.evidenceChunkIds` and `excludedCount` (when provider path runs)
- Consultation status preambles injected for CP material (e.g. CP26/38)

**Example (EVAL-C-01 dry-run):** 6 CP26 chunks selected (`75c6455f4fb9b2f1` …).

---

## 7–9. Structured output, verification, sufficiency (implementation)

- JSON schema: `forgeniq.ask-ri.reasoner-output.v1` (`reasoner-output-schema.mjs`)
- Deterministic verifier: chunk/revision/page/section/excerpt/offset checks (`verify-claims.mjs`)
- Sufficiency enums: `DIRECT_SUPPORT` | `PARTIAL_SUPPORT` | `RELATED_CONTEXT_ONLY` | `NO_SUPPORT`
- Renderer: `render-verified-answer.mjs` (local eval only)

**Offline acceptance:** schema + verifier tests passed (`acceptance-ask-ri-v2-reasoner.mjs`).

---

## 10. Deterministic R2 vs V2 (automated harness; dry-run)

- Baseline: `docs/eval/baseline/deterministic-v2.1-r2-2026-11-10.json`
- **Dry-run:** retrieval + eligibility + pre-reasoner gates only; **no model answers** → harness `outcome` remains `FAIL` vs ideal for most catalogue cases until live run.
- Per-case R2 outcome attached as `deterministicR2Outcome` in V2 report JSON.

**Operator held-out deterministic baseline:** not verified in-repo (no private held-out baseline artefact under `docs/eval/baseline/`). Confirm operator completion separately before generalisation claims.

---

## 11. Per-case findings

See sanitised `phase-2c2-ask-ri-v2-eval-report.json` (`results[]` with `v2ExecutionStatus`, `v2Diagnostics`, `answerPreview`).

---

## 12. EVAL-C-01 (CP26/38)

- **Eligibility:** public — **would** reach model when live key enabled  
- **Retrieval:** hybrid selects publication `4d05b49b-a4a4-4101-8c87-7d3983315f25`, 6 evidence chunks assembled  
- **Live reasoning:** not executed here — SME review of proposals / control implications pending real model + verifier pass

---

## 13. EVAL-G-04

- **Blocked** (`TENANT_CONTEXT_REQUIRED`, `tenant_data_required_flag`)  
- **Anthropic:** not called  
- **Answer:** safe eligibility refusal (no fabricated tenant obligations)

---

## 14–17. Scenario hooks (live eval required for scores)

| Scenario | Dry-run observation |
|----------|---------------------|
| Near-miss negatives | Retrieval + no-match signals computed; sufficiency not model-graded |
| False premises | Pre-reasoner / eligibility only |
| Invalid references | 6 cases blocked at reference validation before provider |
| Consultation vs binding | Preambles + claim classes in prompt; not empirically measured without live run |
| Multiple publications | Multi-pub caps in assembler; not empirically measured without live run |

---

## 18. Human review

- Default `humanReviewRequired: true` for reasoner contract  
- `reasoned_implication` / `consultation_proposal` enforced in verifier

---

## 19–21. Tokens, cost, latency

| Metric | Dry-run | Live (projected) |
|--------|---------|------------------|
| Estimated cost | ~USD **0.38** (38 eligible calls, conservative) | ≤ **USD 10** ceiling |
| Calculated spend | $0 | Provider usage TBD |
| Tokens | 0 / 0 | Recorded per request when live |

Haiku 4.5 estimate basis: `anthropic-eval-budget.mjs` ($1/$5 per MTok in/out).

---

## 22. Remaining limitations

- No live model outputs in this run → no claim-level quality comparison vs deterministic R2  
- Citation verifier does not prove logical entailment  
- Tenant hybrid (G-04) correctly blocked but not fused in V2  
- Index rebuild per eval run (~50s) — cache not optimised  
- `ASK_RI_ENGINE=v2` remains **off**; no production/staging integration

---

## 23. Recommended next steps

1. Operator: confirm **private held-out deterministic baseline** complete (external to repo).  
2. Set `ANTHROPIC_API_KEY` + `RI_AI_EXECUTION_ENABLED=true`, run:
   - `node apps/platform/scripts/run-ask-ri-v2-eval-2c2.mjs`
3. SME review: EVAL-C-01 control implications, consultation labelling, near-miss abstention.  
4. If quality acceptable: staging shadow with feature flag still off in production; separate approval for logging/retention.

---

## Runbook

```bash
# Offline acceptance
node apps/platform/scripts/acceptance-ask-ri-v2-reasoner.mjs

# Dry-run (no API)
node apps/platform/scripts/run-ask-ri-v2-eval-2c2.mjs --dry-run

# Live eval (operator machine)
set RI_AI_EXECUTION_ENABLED=true
node apps/platform/scripts/run-ask-ri-v2-eval-2c2.mjs
```

---

## Safety checklist

| Requirement | Status |
|-------------|--------|
| No staging/prod DB writes | OK |
| No tenant data to provider | OK (7 blocked) |
| No private held-out access | OK |
| No frozen suite edits | OK |
| No push/deploy | OK |
| $10 spending ceiling | Implemented |
| No API keys in logs/commits | OK |
