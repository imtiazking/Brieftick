# AI execution governance report

## Posture (verified on the running staging app)

- `RI_AI_EXECUTION_ENABLED` is effectively **false**: `GET /api/ri-lab/readiness`, component `ai_runtime`, `livePosture.executionEnabled = false` (read as persona C after the final deploy). Provider mode is configured `ANTHROPIC` but execution is off.
- No paid AI was executed in this programme. Every stage in the hosted UAT ran as a deterministic fixture.

## Spend ledger (read-only SQL, staging `lhgzdicffkhaaykzthep`)

| Measure | Value |
|---|---|
| `lab_ai_spend_reservations` | 10, all `SETTLED`; 0 reserved, 0 failed |
| `lab_ai_spend_accounts` | 1 |
| `lab_ai_spend_recoveries` | 0 |
| `ai_execution_ledger_events` | 0 |
| `ai_analysis_runs` | 31 |

This equals `PRE-MIGRATION-LEDGER-SNAPSHOT.json` (10 reservations, all settled, total `$0.224872`): the two authorised pilots, FCA-EVAL-001 (`$0.073476`, 5 requests) and FCA-EVAL-002 (`$0.151396`, 5 requests). **No reservation or ledger activity occurred during this programme.** Total spend to date is `$0.224872` against the authorised limits.

## Ledger correction

Migration `20261126180000_ai_execution_run_ledger` adds run-reference scoping (three additive tables, two nullable columns, triggers and functions; it drops one foreign key only). Historical reservation rows were not altered. The account counters show the reconciled FCA-EVAL-002 window (5 requests, `$0.151396`), while the 10 reservation rows are retained unchanged. The run-scoped path has **not** been exercised on staging, because doing so needs a paid call, which is not authorised. It is covered by the local acceptance suites.

## Controls proven in this programme

- A use case outside the shared ledger is refused fail-closed before any HTTP call, even with execution enabled (`LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED`).
- A budgeted use case without a shared ledger is refused (`LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED`). The in-process `memory` ledger exists for tests only and uses mocked HTTP.
- An unpriced model is refused; there is no fallback to another model's rate.
- UC-RI-005 needs an authorised run reference suffix.
- Provider failure leaves the run `FAILED`, never `RUNNING`; malformed output gives `VALIDATION_FAILED` (`acceptance-ri-ai-run-finalisation`, repaired this tranche).

## Test-suite changes this tranche

`acceptance-anthropic-provider` and `acceptance-ri-ai-run-finalisation` were stale against the spend guard. They now assert the fail-closed refusal and run their mocked-success paths under the in-process ledger. Both are now in the CI catalogue as `RI-ANTHROPIC-SPEND-GUARD-PROVIDER` (critical). `acceptance-stage-a-e2e-persistence` uses a real provider key and was **not run**: it is BLOCKED because it would incur paid AI.

## Open

- The effective hosted model value is a Secret type and cannot be read back; the first authorised run records the requested and response model in telemetry.
- Any further live evaluation needs explicit authorisation and a defined limit.
