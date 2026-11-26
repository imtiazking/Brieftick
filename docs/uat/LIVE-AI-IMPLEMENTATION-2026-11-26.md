# Live AI implementation readiness (2026-11-26)

Paid AI execution was **not** run. Integration tests use mocked providers and fixtures.

## 1. Implementation status

| Stage | Use case | Status |
| --- | --- | --- |
| 1 Obligation extraction | UC-RI-005 | Already live-capable via `ai-analysis.ts`. Unchanged. |
| 2 Impact | UC-RI-004 | Wired through `runLifecycleStageAnalysis`. Draft impact only after a valid provider result. Live failure skips insert. |
| 3 Risk | UC-RI-006 | Same. Tenant risk catalogue is passed as advisory context. New risks stay drafts. |
| 4 Control | UC-RI-007 | Same. Existing controls are supplied for matching. Effectiveness stays `NOT_TESTED` unless evidence is in the model output and still requires human approval. |
| 5 Assurance | UC-RI-008 | Test-plan draft only. No automatic pass, exception, or lifecycle close. |

Default mode remains **fixture** (`FORGENIQ_STAGE{n}_AI` unset or `FIXTURE`). `ANTHROPIC`, `OPENAI`, `LIVE`, or `AUTO` selects the registry and refuses fixture fallback.

## 2. Provider and model

- Registry: `provider-registry.ts`.
- Anthropic model resolver: `claude-sonnet-4-5` unless `RI_ANTHROPIC_MODEL` / `ANTHROPIC_MODEL` / `RI_AI_MODEL` is set to a non-GPT id.
- OpenAI default id: `gpt-4o-mini`. `createOpenAiProvider().execute` still returns not-implemented for structured analysis, so a live lifecycle pilot must use Anthropic.
- Prompts for risk, control, and assurance schemas are in `anthropic-prompts-core.mjs`.

## 3. Tests

| Check | Result |
| --- | --- |
| `acceptance-ri-lifecycle-live-ai.mjs` | PASS (mock live, invalid output, timeout, budget, request cap, aggregate ledger) |
| `acceptance-ps26-1-lab-anthropic-budget-guard.mjs` | PASS |
| `acceptance-ps26-1-uc-ri-005-execution-controls.mjs` | PASS |
| `acceptance-ri-stage2-obligation-to-impact.mjs` | PASS |
| `acceptance-ri-compliance-lifecycle-e2e.mjs` | PASS |
| Fresh risk browser `4637fbc4-a0bf-40e5-a810-5a04a425274b` then checker path | PASS — maker toast “Segregation of duties…”, status stayed In Review, checker toast “Risk approved” |
| Assurance finding link | PASS — `#/finding/3b98fa4f-06dd-437d-95db-49f04b024532` on `122e9511-323c-49e7-a023-1d54486a97c9` |

The earlier recycled closed-lifecycle browser run is **not** treated as a negative-test pass.

## 4. GitHub Actions

This commit is local until the branch is pushed. The last recorded remote Actions run for the prior lifecycle tranche was success (`45720343481`). Re-run after push.

## 5. Staging

Candidate-first promote follows this commit. Official alias before this tranche: `dpl_5VRiovc31XtAxzocj36wR3jJhoCb`.

## 6. Cost safeguards

`RI_LAB_ANTHROPIC_MAX_USD` is a **process-local** hard stop for UC-RI-005 and UC-RI-004/006/007/008: missing or invalid budget fails closed, pre-flight reserve blocks over-budget calls, and settled token cost accumulates for later calls in the same runtime. It is **not** an Anthropic invoice cap and does **not** synchronise across separate serverless instances. `RI_LAB_ANTHROPIC_MAX_REQUESTS` defaults to 8. `RI_AI_EXECUTION_ENABLED` must be `true` or the provider returns `AI_EXTERNAL_PROCESSING_DISABLED` before any HTTP call.

## 7. Remaining defects

- OpenAI structured execution is still unimplemented; Anthropic is the live path.
- Cross-instance spend is not a shared ledger.
- Pilot FCA-EVAL-001 has not been executed.

## 8. Estimated pilot cost

**$0.34–0.50** typical, ceiling **$0.75** (`RI_LAB_ANTHROPIC_MAX_USD`). See `LIVE-AI-PILOT-BUDGET-2026-11-25.md`.

## 9. Paid AI

**Disabled.** No live provider call was made. Staging continues to default stages 2–5 to fixtures until execution flags and the budget are set for an approved pilot.
