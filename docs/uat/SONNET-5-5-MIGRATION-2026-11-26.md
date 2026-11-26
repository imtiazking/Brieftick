# Claude Sonnet 5.5 migration and five-stage pilot readiness (2026-11-26)

**Live execution is disabled. No paid Anthropic request has been made. Production and customer-facing hosts are untouched.**

## 1. Model migration

Default model id: `claude-sonnet-5-5`. It stays configurable and backward compatible: `RI_ANTHROPIC_MODEL`, then `ANTHROPIC_MODEL`, then `RI_AI_MODEL` (ids starting `gpt-` are ignored). `claude-sonnet-4-5` still resolves and is still priced for historical and rollback use. It retires on 2026-11-30.

### API compatibility (checked against Anthropic's migration guide)

| Area | Behaviour implemented |
| --- | --- |
| Sampling | `temperature`, `top_p`, `top_k` are never sent to 5.5 models. A caller that supplies them gets `AI_REQUEST_CONFIG_INVALID` locally, with no network call. |
| Prefill | Not used. |
| Thinking | Adaptive thinking is the default. `budget_tokens` is rejected. `thinking: disabled` is not accepted by the API, so a configured "disabled" is translated to `between_tools`, valid only at low, medium or high effort. |
| Effort | Set through `output_config.effort`, default `medium`. Unknown values are rejected. |
| `max_tokens` | Adaptive thinking counts toward it. Default 8192. The ledger reserves the full cap. |
| Stop reasons | `refusal` maps to `AI_PROVIDER_REFUSAL`. `model_context_window_exceeded` maps to `AI_CONTEXT_WINDOW_EXCEEDED`. Truncation by `max_tokens` is reported, not silently accepted. |
| Usage | `usage.input_tokens` is uncached input only. Cache writes come from `cache_creation` (5m and 1h) and reads from `cache_read_input_tokens`. An untiered cache write is treated as 1h (the dearer rate). |
| Request id | Read from the `request-id` response header and stored on the reservation. |
| Errors and timeouts | HTTP errors settle at reported usage. A timeout or transport error leaves usage unknown and the database charges the whole reserve. |
| Legacy models | Models outside the 5.5 family get no default thinking or effort, so Sonnet 4.5 requests are unchanged. |

Structured JSON validation is unchanged and still applies to every response. Invalid output is a failed run, not a repaired one.

Limitation: no Anthropic key exists in this environment, so model availability and the request shape were verified against the official documentation and by mocked tests, not by a live call.

### Code

`lib/ri/ai/anthropic-model-config.mjs` (resolution), `anthropic-messages-core.mjs` (policy, body builder, call), `anthropic-provider-core.mjs` (registry provider, telemetry), `lab-anthropic-spend-guard.mjs` and `lab-shared-spend.mjs` (guard and shared ledger), `lifecycle-stage-ai.ts` and `services/ai-analysis.ts` (telemetry and audit).

## 2. Pricing

| Model | Input | Output | Cache write 5m | Cache write 1h | Cache read |
| --- | --- | --- | --- | --- | --- |
| `claude-sonnet-5-5` | $2 / MTok | $10 / MTok | $2.50 | $4 | $0.10 |
| `claude-sonnet-4-5` | $3 / MTok | $15 / MTok | $3.75 | $6 | $0.30 |

Pricing version `anthropic-list-2026-11-26`. Existing Sonnet 4.5 records keep their model id and are not repriced. Historical ledger rows that pre-date the migration keep NULL model and pricing version. A model without a published rate fails closed; there is no fallback to another model's rate.

## 3. Spend guard and ledger

Reused functions: `reserve_lab_ai_spend`, `settle_lab_ai_spend`, `release_abandoned_lab_ai_reservation`. Scope `forgeniq-lab-anthropic`. They are shared across instances, concurrency-safe, fail closed when the ledger is unreachable, and executable only by `service_role` (forced RLS, no grants to public, anon or authenticated).

* **Reserve before every call** at the worst case: the prompt (3 characters per token) at the highest input-side rate ($4/MTok for 5.5) plus the full output cap at the output rate.
* **Settle** after the call. Known usage settles the estimated cost from standard input, output, cache write and cache read tokens, and the unused reserve is released. Unknown usage (timeout, transport error) charges the whole reserve whatever the caller reports.
* **Failed calls count** toward both the request cap and the dollar cap. There is no automatic retry and no fixture fallback during live execution.
* **Recorded per reservation:** model, pricing version, each token category, provider request id, `usage_known`, cost breakdown, reserve basis, reserved cost, settled estimated cost, `provider_deadline_at`.
* **The budget is an estimated-cost control, not an invoice cap.** Provider billing remains the source of truth.

### Recovery of a stuck reservation

Release is auditable and never automatic.

1. The actor must be registered and active in `lab_ai_spend_operators` (empty by default).
2. `provider_deadline_at` must have passed (call window plus 120 s, at least 420 s) and the reservation must be at least 180 s old (900 s for legacy rows without a deadline). This is the check that the provider cannot still produce an unaccounted charge.
3. A documented reason of at least 20 characters is required.
4. Resolution is `ASSUME_MAX` (default: the whole reserve stays spent) or `VERIFIED_USAGE` (needs an observed cost and at least 20 characters of evidence).
5. One recovery per reservation (unique index). The request count is kept. An audit row is written to `lab_ai_spend_recoveries`.

Operator tooling: `npm run staging:lab-spend-ledger -- status | register-operator | recover` (dry run unless `--yes`; the connection string is never printed).

### Migration

`20261126120000_lab_ai_spend_usage_categories_and_recovery_v2.sql`, listed in the staging migration manifest. It adds usage columns, drops and recreates the three functions with explicit named parameters (single signature each), creates `lab_ai_spend_operators` and the recoveries uniqueness index. It is additive for data; no row is rewritten.

## 4. Five-stage readiness (mocked, fixture-grounded)

| Stage | Use case | Result under mocked provider |
| --- | --- | --- |
| 1 | UC-RI-005 obligation extraction | Valid output creates a draft candidate only; citations validated; duplicates avoided |
| 2 | UC-RI-004 impact assessment | Draft only; parent obligation lock; no auto-approval |
| 3 | UC-RI-006 risk | Draft only; existing risks matched before new ones proposed |
| 4 | UC-RI-007 control mapping | Draft only; gaps recorded, no invented controls |
| 5 | UC-RI-008 assurance | Draft only; no fabricated test results; effectiveness not declared |

In every stage: maker-checker is enforced, nothing is approved or opened automatically, the lifecycle is not closed by AI, and an invalid provider response fails the run without creating records. Tests: `acceptance-anthropic-sonnet-55-compat` (46 checks), `acceptance-ri-shared-spend-guard` (budget race, 12-client concurrency, request cap, recovery matrix, forced RLS), `acceptance-ri-lifecycle-live-ai` (telemetry, failed-call spend, registry selection), plus the existing stage, tenant isolation, segregation-of-duties and end-to-end lifecycle suites inside `npm run qa`.

## 5. Pilot configuration (prepared, not active)

Pilot limits: $0.75 and 8 requests. Estimated spend for the five-stage run with Sonnet 5.5 is about $0.14 (about $0.25 with adaptive thinking). Worst-case reserves are $0.130, $0.094, $0.096, $0.096 and $0.094 (total $0.51), so the $0.75 limit holds. Detail: `LIVE-AI-PILOT-BUDGET-2026-11-25.md`.

Activation values (do **not** set without explicit authorisation):

```
RI_AI_EXECUTION_ENABLED=true
RI_AI_PROVIDER_MODE=ANTHROPIC
RI_ANTHROPIC_MODEL=claude-sonnet-5-5
FORGENIQ_STAGE2_AI=ANTHROPIC
FORGENIQ_STAGE3_AI=ANTHROPIC
FORGENIQ_STAGE4_AI=ANTHROPIC
FORGENIQ_STAGE5_AI=ANTHROPIC
RI_LAB_ANTHROPIC_MAX_USD=0.75
RI_LAB_ANTHROPIC_MAX_REQUESTS=8
RI_LAB_SPEND_SCOPE=forgeniq-lab-anthropic
```

Restore after the pilot: `RI_AI_EXECUTION_ENABLED=false` and the four stage flags back to `FIXTURE`.

Staging values are stored as Secret variables, which the Vercel CLI cannot read back. `RI_ANTHROPIC_MODEL` was updated in place to `claude-sonnet-5-5`; its effective value cannot be read, and the code default is also 5.5. The hosted deployment's posture is therefore proven behaviourally (fixture mode, empty ledger, no new AI runs). `scripts/staging/print-ai-config-posture.mjs` checks the same posture wherever values are readable.

## 6. Evaluation

FCA-EVAL-001 evidence capture is prepared: `eval/FCA-EVAL-001-EVIDENCE-PLAN-2026-11-26.md`. Technical success and regulatory accuracy are reported separately. Regulatory accuracy is **not assessed**.
