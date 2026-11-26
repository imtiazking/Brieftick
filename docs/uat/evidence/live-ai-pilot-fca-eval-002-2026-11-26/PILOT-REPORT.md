# FCA-EVAL-002 — live five-stage pilot report

Run reference: `pilot-fca-eval-002-conc-7-20-1r`. Evidence: `C:/Users/imtia/AppData/Local/forgeniq-ri-classification/docs/uat/evidence/live-ai-pilot-fca-eval-002-2026-11-26`.

## Acceptance criteria: 11/11 passed

- [x] correct_provision_level_legal_classification — R
- [x] correct_effective_dates_with_provenance — 2026-07-15
- [x] mandatory_limb_present:CONC 7.20.1R(2)(a) — ["CONC 7.20.1R(2)(a)","CONC 7.20.1R(2)(b)","CONC 7.20.1R(3)"]
- [x] mandatory_limb_present:CONC 7.20.1R(2)(b) — ["CONC 7.20.1R(2)(a)","CONC 7.20.1R(2)(b)","CONC 7.20.1R(3)"]
- [x] mandatory_limb_present:CONC 7.20.1R(3) — ["CONC 7.20.1R(2)(a)","CONC 7.20.1R(2)(b)","CONC 7.20.1R(3)"]
- [x] impact_materiality_not_from_confidence — UNASSESSED
- [x] assurance_not_truncated_mid_word — 4537
- [x] raw_provider_telemetry_captured — exportedAt,exportedBy,stage1,stage3,stage4,stage5
- [x] request_count_within_limit — 5
- [x] settled_within_budget — 0.151396
- [x] unresolved_interpretations_flagged — true

## Expert-review escalations (unchanged)

- **CONC 7.20.1R(2)** As soon as possible
- **CONC 7.20.1R(2)(b)** Sufficient information
- **CONC 7.20.1R(2)(b)(ii)–(iii)** Adverse consequences
- **CONC 7.20.1R(2)(b)(iii)** Likelihood assessment
- **CONC 7.20.1R(2)(b)(iv)** Relevant mitigation measures
- **CONC 7.20.1R** Transitional provisions
- **CONC 7.20.1R** Applicability to temporary-permission firms

## Ledger

```json
{
  "capturedAt": "2026-11-26T16:08:00Z",
  "runReference": "pilot-fca-eval-002-conc-7-20-1r",
  "source": "lab_ai_spend_reservations / lab_ai_spend_accounts on forgeniq-ri-staging (read-only SQL)",
  "scopeKey": "forgeniq-lab-anthropic",
  "pricingVersion": "anthropic-list-2026-11-26",
  "model": "claude-sonnet-5-5",
  "budgetUsd": 0.75,
  "maxRequests": 8,
  "requests": [
    {
      "stage": 1,
      "useCase": "UC-RI-005",
      "idempotencyKey": "UC-RI-005:a12a0769-31a5-4b2a-a6e0-962a5cb70dcd:b8f5e3a1-00ad-4000-8000-000000000001:pilot-fca-eval-002-conc-7-20-1r",
      "status": "SETTLED",
      "reserveUsd": 0.042204,
      "actualUsd": 0.030844,
      "inputTokens": 6237,
      "outputTokens": 1837,
      "providerRequestId": "req_011ChRfV3i5ZNaYwXixeBz21"
    },
    {
      "stage": 2,
      "useCase": "UC-RI-004",
      "idempotencyKey": "stage2:8385215c-c108-4731-aa64-56385f8b4b6d",
      "status": "SETTLED",
      "reserveUsd": 0.091472,
      "actualUsd": 0.027456,
      "inputTokens": 2883,
      "outputTokens": 2169,
      "providerRequestId": "req_011ChRmpUhiWo89Phbizeika"
    },
    {
      "stage": 3,
      "useCase": "UC-RI-006",
      "idempotencyKey": "stage3:8834a25f-d6f4-4100-8d53-e03e2114366b",
      "status": "SETTLED",
      "reserveUsd": 0.09448,
      "actualUsd": 0.029148,
      "inputTokens": 3879,
      "outputTokens": 2139,
      "providerRequestId": "req_011ChRmsLae9ZDAoTXPChapj"
    },
    {
      "stage": 4,
      "useCase": "UC-RI-007",
      "idempotencyKey": "stage4:dd826913-7d44-48f8-b3f1-0ca00dd2e429:pilot-fca-eval-002-conc-7-20-1r-retry-2",
      "status": "SETTLED",
      "reserveUsd": 0.095776,
      "actualUsd": 0.035692,
      "inputTokens": 4211,
      "outputTokens": 2727,
      "providerRequestId": "req_011ChRppbWM4vAadwcQXaGCC",
      "note": "Recovery call after LAB_ANTHROPIC_BUDGET_EXCEEDED on initial approve (shared ledger request_count included eval-001); staging account reconciled for this window before retry"
    },
    {
      "stage": 5,
      "useCase": "UC-RI-008",
      "idempotencyKey": "stage5:bdb634df-e1a5-4883-9fca-990a44a294b8",
      "status": "SETTLED",
      "reserveUsd": 0.09206,
      "actualUsd": 0.028256,
      "inputTokens": 3048,
      "outputTokens": 2216,
      "providerRequestId": "req_011ChRptGANEZFYkSYYS5MNH"
    }
  ],
  "totals": {
    "requests": 5,
    "inputTokens": 20258,
    "outputTokens": 11088,
    "settledUsd": 0.151396,
    "remainingBudgetUsd": 0.598604,
    "remainingRequests": 3
  },
  "requestCount": 5,
  "settledUsd": 0.151396,
  "accountRow": {
    "settled_usd": 0.151396,
    "reserved_usd": 0,
    "request_count": 5,
    "note": "Counts five SETTLED reservations for runReference pilot-fca-eval-002-conc-7-20-1r only (14:00Z onward)"
  },
  "reconciliation": {
    "openReservations": 0,
    "withinBudget": true,
    "withinRequestLimit": true,
    "eval001LedgerRowsPreserved": true,
    "stage4InitialSkipReason": "LAB_ANTHROPIC_BUDGET_EXCEEDED"
  }
}
```
