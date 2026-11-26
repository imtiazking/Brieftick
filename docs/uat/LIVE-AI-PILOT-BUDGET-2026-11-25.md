# Live AI pilot — budget (updated for Claude Sonnet 5.5, 2026-11-26)

**No paid AI has been executed for this tranche.** Live execution stays disabled until you authorise the first paid request. Full migration record: `SONNET-5-5-MIGRATION-2026-11-26.md`.

## Pricing basis

Published list prices, kept in `apps/platform/lib/ri/reasoner/anthropic-eval-budget.mjs` (pricing version `anthropic-list-2026-11-26`). Each ledger row records the model id and pricing version it was priced under. Earlier Sonnet 4.5 usage is not repriced.

| Model | Input | Output | Cache write 5m | Cache write 1h | Cache read |
| --- | ---: | ---: | ---: | ---: | ---: |
| `claude-sonnet-5-5` (default) | $2 / MTok | $10 / MTok | $2.50 | $4 | $0.10 |
| `claude-sonnet-4-5` (legacy, retires 2026-11-30) | $3 / MTok | $15 / MTok | $3.75 | $6 | $0.30 |

Default model: `claude-sonnet-5-5` (`RI_ANTHROPIC_MODEL` overrides). A model with no entry in the table is refused (fail closed); there is no fallback to another model's rate.

## Estimated calls (pilot v1, Sonnet 5.5)

"Expected" assumes the same token estimates as the Sonnet 4.5 plan with no thinking overhead. "Ceiling" is what the ledger reserves per call: the prompt at the highest input-side rate ($4 / MTok, the 1h cache write rate) plus the full 8,192-token output cap at $10 / MTok. Adaptive thinking tokens count toward `max_tokens` and are billed as output.

| Step | Use case | Calls | Est. input tokens | Est. output tokens | Expected USD | Reserve ceiling USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Obligation extraction | UC-RI-005 | 1 | 12,000 | 4,000 | 0.064 | 0.130 |
| Impact suggestion | UC-RI-004 | 1 | 3,000 | 1,200 | 0.018 | 0.094 |
| Risk mapping | UC-RI-006 | 1 | 3,500 | 1,500 | 0.022 | 0.096 |
| Control mapping | UC-RI-007 | 1 | 3,500 | 1,500 | 0.022 | 0.096 |
| Assurance plan | UC-RI-008 | 1 | 3,000 | 1,200 | 0.018 | 0.094 |
| **Total (five stages)** | | **5** | | | **0.14** | **0.51** |

With thinking tokens roughly doubling output, expect about **$0.25**. The Sonnet 4.5 plan was $0.34–0.50. The five-stage ceiling is $0.51 even if every call spends its full output cap. The reserve uses a pessimistic 3 characters per token for the prompt, so the real reserve is slightly higher than the table.

## Hard limits (pilot environment)

| Control | Value |
| --- | --- |
| `RI_LAB_ANTHROPIC_MAX_USD` | **0.75** |
| `RI_LAB_ANTHROPIC_MAX_REQUESTS` | **8** (a failed call uses one) |
| `RI_LAB_SPEND_SCOPE` | `forgeniq-lab-anthropic` |
| Output cap per request | **8,192** tokens (`RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS` to change); includes thinking |
| `RI_ANTHROPIC_EFFORT` / `RI_ANTHROPIC_THINKING` | `medium` / `adaptive` (defaults) |
| `RI_ANTHROPIC_TIMEOUT_MS` | **120000** suggested; the recovery window is at least 420 s |
| Max HTTP attempts | **1**. No automatic retry. Truncation, refusal and context-window stops fail closed. |
| `RI_AI_EXECUTION_ENABLED` | `true` only during the pilot window |

## Estimate versus Anthropic invoice

The ledger is an estimated-cost control, not an invoice cap. It prices the four reported usage categories (standard input, output, cache writes by tier, cache reads) with the table above. Each request reserves its worst case before HTTP, then settles the reported usage and releases the unused reserve. A failed call consumes one request. HTTP errors and refusals settle at the reported usage. A timeout or transport error has unknown provider usage and settles at the **full reserve**. A process that dies between reserve and settle leaves a `RESERVED` hold that only a registered operator can recover, after the provider window has ended (see the migration record). Anthropic's invoice can still differ (discounts, taxes, tier changes).

## Authorisation

Live execution is **not** authorised. Keep `FORGENIQ_STAGE2_AI` … `STAGE5_AI` = `FIXTURE` and `RI_AI_EXECUTION_ENABLED` unset/false until you give an explicit instruction.
