# Live AI lifecycle pilot — design (do not execute without approval)

## Objective

One end-to-end path: **approved human-verified obligation** (from FCA-EVAL-001) → live draft suggestions for impact, risk, control, assurance — all remaining **DRAFT** until existing human approval gates pass.

## Preconditions

1. Staging org UAT tenant; Users A (maker), B/C (checkers).  
2. `RI_AI_EXECUTION_ENABLED=true` **only** for pilot window.  
3. `RI_AI_PROVIDER_MODE=ANTHROPIC` (or `LIVE` with Anthropic key).  
4. `RI_LAB_ANTHROPIC_MAX_USD` set to approved ceiling (see budget doc).  
5. Downstream live wiring **shipped** or pilot limited to UC-RI-005 + manual human stages 2–5 (see readiness doc).  
6. No production deploy; no Clerk permission changes.

## Execution steps (ordered)

1. **Ingest / select** CONC publication version already in staging.  
2. **Applicability** — human APPROVED APPLICABLE.  
3. **UC-RI-005 run** — idempotency key `pilot-fca-eval-001-{date}`; capture run id.  
4. **Finding review** — independent reviewer; materialise only accepted claims.  
5. **Obligation OPEN** — checker approval (not AI acceptor).  
6. **Stage 2 live** — trigger `ensureImpactAssessmentFromApprovedObligation` with `FORGENIQ_STAGE2_AI=ANTHROPIC` (after code enable).  
7. **Human** submit + checker approve impact.  
8. **Stages 3–5 live** — same pattern for risk, control, assurance drafts.  
9. **Assurance** — evidence + finding closure rules unchanged.  
10. **Archive** prompt, model id, token usage, latency, USD estimate per call in `docs/uat/evidence/live-ai-pilot-{date}/`.

## Telemetry (required per AI call)

| Field | Storage |
| --- | --- |
| Prompt hash + version | Run metadata / workflow event |
| Provider + model | `ai_analysis_runs` or stage `metadata.stageNAi` |
| Raw response reference | Blob or redacted JSON in evidence pack |
| Citations returned | Structured output validation log |
| `input_tokens`, `output_tokens`, `latency_ms` | Provider result → DB when wired |
| Estimated USD | `anthropic-eval-budget.mjs` estimators |
| Actor / org / idempotency key | Existing RLS-scoped rows |

## Safety checks

- Structured output schema validation (`validateStructuredOutput`) before persist.  
- Reject ungrounded citations (`citation-validator`).  
- Duplicate detection: idempotent keys per parent entity.  
- Provenance: all child rows carry `sourceRegulatoryObligationId` / parent locks.  
- Draft-only: no auto-approve actions.

## Rollback

- Set `RI_AI_EXECUTION_ENABLED=false` and stage flags back to `FIXTURE`.  
- Pilot obligation flagged `metadata.pilotRunId`; exclude from operational dashboard partitions.