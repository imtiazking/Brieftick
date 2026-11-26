# Live AI lifecycle pilot — design (do not execute without approval)

## Objective

One end-to-end path: **approved human-verified obligation** (from FCA-EVAL-001) → live draft suggestions for impact, risk, control, assurance — all remaining **DRAFT** until existing human approval gates pass.

## Preconditions

1. Staging org UAT tenant; Users A (maker), B/C (checkers).
2. `RI_AI_EXECUTION_ENABLED=true` only for the pilot window, then return it to false.
3. `RI_AI_PROVIDER_MODE=ANTHROPIC`. Stages 2–5 stay `FIXTURE` until that window, then set `FORGENIQ_STAGE2_AI` … `FORGENIQ_STAGE5_AI=ANTHROPIC` and return them to `FIXTURE`.
4. Shared ledger migrations applied on forgeniq-ri-staging: `20261126013000_lab_ai_shared_spend_guard.sql` and `20261126014500_lab_ai_shared_spend_revoke_client_execute.sql`. Without the ledger, live calls fail closed. `anon` and `authenticated` cannot execute the functions.
5. `RI_LAB_ANTHROPIC_MAX_USD=0.75` and `RI_LAB_ANTHROPIC_MAX_REQUESTS=8`.
6. No customer production deploy. No Clerk changes.

## Execution steps (ordered)

1. Select the staged CONC publication for FCA-EVAL-001.
2. Human applicability approval.
3. UC-RI-005 with idempotency key `pilot-fca-eval-001`. Capture model id, tokens, latency, and the shared reservation row.
4. Independent finding review. Materialise only accepted claims.
5. Checker opens the obligation. The maker does not approve their own AI output.
6. Set stage 2 to Anthropic and approve the obligation so the impact draft is created. Confirm `executionMode=live` and schema validation.
7. Checker approves the impact. Repeat for risk, control, and assurance drafts.
8. Leave assurance unclosed. AI must not record a test result.
9. Set stage flags back to `FIXTURE` and disable execution.
10. Archive the evidence pack under `docs/uat/evidence/live-ai-pilot-fca-eval-001/`. Capture, for the chain publication → obligation → impact → risk → control → assurance: actual model id, source citations, AI recommendations, schema validation, hallucination review against CONC 7.20.1R, prompt and output token counts, provider-reported usage, latency, estimated reserve and settled cost, parent/child database ids, and the workflow-event history. All AI rows stay drafts until a test persona approves them.

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