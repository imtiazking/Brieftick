# Live AI readiness — Design Lab compliance lifecycle (2026-11-25)

Staging reference deployment: `dpl_6isCeKaCNMuAYR9PvCGfdSSXirPR` (release commit `9241298` prior to this tranche).

## Summary

| Stage / use case | Capability | Runtime today on staging | Live path in codebase |
| --- | --- | --- | --- |
| **Stage 1** | UC-RI-005 obligation extraction & classification | **Fixture / synthetic runs** for lifecycle UAT; paid Anthropic path exists when `RI_AI_EXECUTION_ENABLED=true` | **Yes** — `ai-analysis.ts` + `provider-registry.ts` |
| **Stage 2** | UC-RI-004 Impact Assessment | **FIXTURE** (`FORGENIQ_STAGE2_AI`, scenario `stage2-obligation-impact`) | **Partial** — only `createFixtureProvider()` wired in `obligation-impact-downstream.ts`; non-fixture mode skips AI (`SKIPPED_NO_FIXTURE`) |
| **Stage 3** | UC-RI-006 Risk Mapping | **FIXTURE** (`stage3-impact-risk`) | **Partial** — same pattern in `impact-risk-downstream.ts` |
| **Stage 4** | UC-RI-007 Control Mapping | **FIXTURE** (`stage4-risk-control`) | **Partial** — `risk-control-downstream.ts` |
| **Stage 5** | UC-RI-008 Control Assurance | **FIXTURE** (`stage5-control-assurance`) | **Partial** — `control-assurance-downstream.ts` |

**Conclusion:** Hosted five-stage UAT validates **governance, persistence, and navigation** under **deterministic fixture AI**. Genuine live AI is **production-ready for UC-RI-005 (publication analysis)** subject to env, budget guard, and human review. **Stages 2–5 do not yet invoke live providers** when fixture flags are disabled; enabling live stages requires new downstream provider calls (same registry as Stage 1) plus pilot telemetry.

## Stage 1 — UC-RI-005 (and related UC-RI-001–003)

- **Provider resolution:** `RI_AI_PROVIDER_MODE` (`FIXTURE` | `ANTHROPIC` | `OPENAI` | `LIVE` | `AUTO`), `resolveAiProviderMode()` / `getAiProvider()` in `apps/platform/lib/ri/ai/provider-registry.ts`.
- **Models:** Anthropic default `claude-sonnet-4-5` via `RI_ANTHROPIC_MODEL` / `ANTHROPIC_MODEL` / `RI_AI_MODEL`; OpenAI `RI_OPENAI_MODEL` (default `gpt-4o-mini`).
- **Execution gate:** `RI_AI_EXECUTION_ENABLED=true` required for paid calls; fail-closed if live requested but keys missing (`AI_LIVE_PROVIDER_UNAVAILABLE`).
- **Spend guard (UC-RI-005):** `lab-anthropic-spend-guard.mjs` — requires `RI_LAB_ANTHROPIC_MAX_USD` when execution enabled; tracks reservations, prompt size, in-flight scope.
- **Pathway:** Design Lab → `/api/ri-lab/ai-analysis-runs` → `executePublicationAnalysis` / materialisation → human finding review → obligation OPEN.
- **Persistence:** `ai_analysis_runs` (provider, model, structured_output, latency_ms, token usage fields when live), workflow events, findings.
- **Staging assumption:** Current lifecycle obligation `b330fc90-b16c-4dd0-947f-10a96c209efe` is **synthetic / fixture-backed**, not a fresh paid UC-RI-005 run.

## Stages 2–5 — Downstream lifecycle AI

Each downstream service uses:

```text
stageNFixtureEnabled() := (FORGENIQ_STAGE{n}_AI || RI_AI_PROVIDER_MODE || 'FIXTURE') ∈ {FIXTURE, 1, TRUE}
```

When true: `createFixtureProvider().execute({ useCaseId: UC-RI-00x, fixtureScenario: 'stageN-...' })`.

When false: **no provider call**; drafts are created from empty structured input and mapper defaults (human confirmation labels).

**Env vars:**

| Variable | Stage |
| --- | --- |
| `FORGENIQ_STAGE2_AI` | Impact |
| `FORGENIQ_STAGE3_AI` | Risk |
| `FORGENIQ_STAGE4_AI` | Control |
| `FORGENIQ_STAGE5_AI` | Assurance |
| `RI_AI_PROVIDER_MODE` | Global fallback for all stage checks |

## UI provider status

Design Lab can surface provider health via `getProviderStatusForUi` / staging operational readiness checks — live modes show as unavailable without keys regardless of UI labels.

## Pilot implication

A **single live lifecycle pilot** must either:

1. Start from a **human-verified obligation** produced by an approved UC-RI-005 run (live or carefully reviewed fixture), then **implement live downstream calls** before Stages 2–5, or  
2. Run **UC-RI-005 live only** in pilot v1 and keep Stages 2–5 on fixture until downstream live wiring ships.

This document recommends **pilot v1b**: one approved obligation from validated FCA material + **four downstream live calls** behind feature flags, with drafts and existing approval gates unchanged.