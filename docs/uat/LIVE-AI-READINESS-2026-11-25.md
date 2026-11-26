# Live AI readiness — Design Lab compliance lifecycle (2026-11-25)

Staging reference deployment: `dpl_6isCeKaCNMuAYR9PvCGfdSSXirPR` (release commit `9241298` prior to this tranche).

## Summary

| Stage / use case | Runtime today on staging | Live path |
| --- | --- | --- |
| **Stage 1** UC-RI-005 | Fixture unless `RI_AI_EXECUTION_ENABLED=true` and a live mode is set | `ai-analysis.ts` + `provider-registry.ts` |
| **Stages 2–5** UC-RI-004 / 006 / 007 / 008 | **Fixture by default** (`FORGENIQ_STAGE{n}_AI` or `RI_AI_PROVIDER_MODE`) | `runLifecycleStageAnalysis` in `lifecycle-stage-ai.ts` calls `getAiProvider()`. A live request that fails does **not** insert a draft and does **not** fall back to fixtures. |

Paid execution stays off until `RI_AI_EXECUTION_ENABLED=true` and the shared ledger can reserve against `RI_LAB_ANTHROPIC_MAX_USD`. The guard covers UC-RI-004, UC-RI-006, UC-RI-007 and UC-RI-008 as well as UC-RI-005. Reservations are atomic in staging Postgres across serverless instances. `RI_LAB_ANTHROPIC_MAX_REQUESTS` defaults to 8. Estimated cost uses the static price table and is not an Anthropic invoice.

Models: Anthropic `claude-sonnet-4-5` (`resolveAnthropicModel`), OpenAI `gpt-4o-mini` (structured OpenAI analysis still returns not-implemented; live lifecycle preference is Anthropic).

## Stage 1 — UC-RI-005 (and related UC-RI-001–003)

- **Provider resolution:** `RI_AI_PROVIDER_MODE` (`FIXTURE` | `ANTHROPIC` | `OPENAI` | `LIVE` | `AUTO`), `resolveAiProviderMode()` / `getAiProvider()` in `apps/platform/lib/ri/ai/provider-registry.ts`.
- **Models:** Anthropic default `claude-sonnet-4-5` via `RI_ANTHROPIC_MODEL` / `ANTHROPIC_MODEL` / `RI_AI_MODEL`; OpenAI `RI_OPENAI_MODEL` (default `gpt-4o-mini`).
- **Execution gate:** `RI_AI_EXECUTION_ENABLED=true` required for paid calls; fail-closed if live requested but keys missing (`AI_LIVE_PROVIDER_UNAVAILABLE`).
- **Spend guard (UC-RI-005):** `lab-anthropic-spend-guard.mjs` — requires `RI_LAB_ANTHROPIC_MAX_USD` when execution enabled; tracks reservations, prompt size, in-flight scope.
- **Pathway:** Design Lab → `/api/ri-lab/ai-analysis-runs` → `executePublicationAnalysis` / materialisation → human finding review → obligation OPEN.
- **Persistence:** `ai_analysis_runs` (provider, model, structured_output, latency_ms, token usage fields when live), workflow events, findings.
- **Staging assumption:** Current lifecycle obligation `b330fc90-b16c-4dd0-947f-10a96c209efe` is **synthetic / fixture-backed**, not a fresh paid UC-RI-005 run.

## Stages 2–5 — Downstream lifecycle AI

`resolveLifecycleExecutionMode` reads `FORGENIQ_STAGE2_AI` … `FORGENIQ_STAGE5_AI`, then `RI_AI_PROVIDER_MODE`, default `FIXTURE`.

- Fixture: existing scenarios `stage2-obligation-impact`, `stage3-impact-risk`, `stage4-risk-control`, `stage5-control-assurance`.
- Live: `getAiProvider()` with the same request shape. Invalid or failed provider results return `skipped` with the error code and **do not** create the child record.
- Audit fields on the child metadata: `executionMode`, `model`, token estimates, latency, and estimated USD when the spend guard returns an audit.

**Env vars:** `FORGENIQ_STAGE2_AI`, `FORGENIQ_STAGE3_AI`, `FORGENIQ_STAGE4_AI`, `FORGENIQ_STAGE5_AI`, `RI_AI_PROVIDER_MODE`, `RI_AI_EXECUTION_ENABLED`, `RI_LAB_ANTHROPIC_MAX_USD`, `RI_LAB_ANTHROPIC_MAX_REQUESTS`.

## UI provider status

Design Lab can surface provider health via `getProviderStatusForUi` / staging operational readiness checks — live modes show as unavailable without keys regardless of UI labels.

## Pilot implication

A **single live lifecycle pilot** must either:

1. Start from a **human-verified obligation** produced by an approved UC-RI-005 run (live or carefully reviewed fixture), then **implement live downstream calls** before Stages 2–5, or  
2. Run **UC-RI-005 live only** in pilot v1 and keep Stages 2–5 on fixture until downstream live wiring ships.

This document recommends **pilot v1b**: one approved obligation from validated FCA material + **four downstream live calls** behind feature flags, with drafts and existing approval gates unchanged.