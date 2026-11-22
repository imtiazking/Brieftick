# P3+ checkpoint — full publication extraction & PS22 validation

**Date:** 2026-11-22 (UTC)  
**Staging:** `https://staging-app.forgeniq.com`  
**Latest deploy:** `dpl_DLjK7NH1QtT1BeJ7bA9jN3HHoDXT`  
**Constraints:** No production; no additional paid AI beyond prior authorisation.

## Priority 1 — Full publication extraction (simulated)

| Check | Evidence |
|-------|----------|
| `instrument_coverage_v2` plan — no 12-batch publication ceiling | `extraction-batch-plan.mjs` — `resolvePlanBatchLimit` + `fullPublicationCoverage` |
| Configurable batch size / session limits | API: `maxBatches`, `maxBatchesThisSession`, `maxBatchesSafetyCap`, `fullPublicationCoverage` |
| Resumable multi-session orchestration | `runOrchestrationSession` + `extendOrchestrationPlan`; `advance_session` API action |
| PS26/1 simulated full coverage | **47/47** provisions, **2** batches, inventory **0** unresolved — `FULL-PUBLICATION-SIMULATED-P3-2026-11-22.json` |
| PS22/9 simulated full coverage | **242/242** provisions, **5** batches, inventory **0** unresolved — same file |
| Resumable acceptance (PS22 cap → resume) | `acceptance-ri-publication-extraction-resumable.mjs` — **6** sessions, ledger **1→6** |

## Priority 2 — Extraction accuracy (35E / IGC)

| Check | Evidence |
|-------|----------|
| Root cause documented | `PS22-35E-IGC-EXTRACTION-ROOT-CAUSE.json` |
| Provision-scoped excerpts in grounding | `build-pdf-grounded-analysis-context.mjs`, `deterministic-provision-candidates.mjs` |
| Provider prompt scoped-quotation rule | `anthropic-prompts-core.mjs` + context wiring in `ai-analysis.ts` |
| Human-assisted vs automated distinction | Documented in root-cause JSON; staging positive path remains human-corrected quotes on run `3ed8c3e2` |

## Priority 3 — FCA validation

| Check | Evidence |
|-------|----------|
| Binding `2046ef71` OPEN | `PS22-9-FCA-FINAL-VALIDATION-2026-11-22.json` |
| Evidential `7143f1ff` OPEN, `legalStatus` evidential | same |
| `supportsObligationId` → `2046ef71`, not `68051a63` | same |
| Prior 2A.4.13R `68051a63` OPEN (independent) | same |
| Staging P2 regression | `staging-p2-regression.mjs` (post-deploy) |

## Priority 4 — Governance

| Item | Status |
|------|--------|
| FRC suspension package for operator | `REG-FRC-SUSPEND-CONVERSION-PROPOSAL-2026-11-22.json` |
| PRA / ICO / PSR classification research | Continue in existing eval docs (no policy change this tranche) |
| Implementation commit | Post-test git commit on `feature/ri-classification-triage` |

## Local acceptance summary

- `acceptance-ri-classification-policy-core.mjs` — **116/116**
- `acceptance-ri-publication-extraction-engine.mjs` — **13/13**
- `acceptance-ri-extraction-batch-plan.mjs` — **5/5**
- `acceptance-ri-publication-extraction-orchestrator.mjs` — **6/6**
- `acceptance-ri-provision-inventory.mjs` — pass
- `acceptance-ri-full-publication-simulated-p3.mjs` — PS26 + PS22 pass
- `acceptance-ri-publication-extraction-resumable.mjs` — pass