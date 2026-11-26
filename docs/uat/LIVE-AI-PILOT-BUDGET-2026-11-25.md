# Live AI pilot — proposed budget (approval required)

**No paid AI has been executed for this tranche.**

## Pricing basis

Conservative estimates from `apps/platform/lib/ri/reasoner/anthropic-eval-budget.mjs` (Sonnet 4.5: $3 / MTok in, $15 / MTok out).

Default model: `claude-sonnet-4-5` (`RI_ANTHROPIC_MODEL`).

## Estimated calls (pilot v1)

| Step | Use case | Calls | Est. input tokens | Est. output tokens | Est. USD |
| --- | --- | ---: | ---: | ---: | ---: |
| Obligation extraction | UC-RI-005 | 1 (+0–1 retry) | 12,000 | 4,000 | **0.10–0.18** |
| Impact suggestion | UC-RI-004 | 1 | 3,000 | 1,200 | **0.03** |
| Risk mapping | UC-RI-006 | 1 | 3,500 | 1,500 | **0.04** |
| Control mapping | UC-RI-007 | 1 | 3,500 | 1,500 | **0.04** |
| Assurance plan | UC-RI-008 | 1 | 3,000 | 1,200 | **0.03** |
| **Subtotal (downstream needs wiring)** | | **4–5** | | | **0.24–0.32** |
| **Total with UC-RI-005** | | **5–6** | | | **0.34–0.50** |

Add **50% contingency** for truncation retries and PDF batch overlap: **recommended ceiling $0.75 USD**.

## Hard limits (proposed env)

| Control | Value |
| --- | --- |
| `RI_LAB_ANTHROPIC_MAX_USD` | **0.75** (pilot); raise only with written approval |
| `RI_ANTHROPIC_MAX_TOKENS` | **4096** per request (existing default) |
| `RI_ANTHROPIC_TIMEOUT_MS` | **120000** (pilot suggestion) |
| Max HTTP attempts | **1**. Truncation fails closed. No automatic retry. |
| Concurrent in-flight UC-RI-005 | **1** per org (spend guard) |
| `RI_AI_EXECUTION_ENABLED` | `true` only during pilot window |

## Estimate versus Anthropic invoice

The ledger prices tokens with the static Sonnet 4.5 table ($3 / MTok input, $15 / MTok output). Anthropic's invoice can differ by cache reads, batch discounts, or a model price change. Each request reserves the prompt-size estimate plus the full output cap, then settles the provider's reported token counts and releases the unused reserve. A failed call still consumes one request and settles whatever usage the provider reported (often zero). A process that dies after reserve and before settle leaves a `RESERVED` hold until that row is settled; nothing expires it automatically. The ledger does not span a different `RI_LAB_SPEND_SCOPE`.

## Approval question

**Proceed with live pilot under `RI_LAB_ANTHROPIC_MAX_USD=0.75` and Anthropic on staging?** (Y/N)

Until approved: keep `FORGENIQ_STAGE2_AI` … `STAGE5_AI` = `FIXTURE` and `RI_AI_EXECUTION_ENABLED` unset/false on staging.