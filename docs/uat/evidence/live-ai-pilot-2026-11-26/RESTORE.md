# Restore and final state (FCA-EVAL-001 pilot)

| Item | Result |
|---|---|
| Env restored (Vercel `forgeniq-platform-staging`, in place) | `RI_AI_EXECUTION_ENABLED=false`; `FORGENIQ_STAGE2_AI..STAGE5_AI=FIXTURE`; pilot run-reference suffixes (both vars) set to `closed-pilot-fca-eval-001-2026-11-26-consumed` |
| Final staging deployment | `dpl_xVuJVTVj6gfUQKDjBeTkhbV8onHU`, built from `f93cb89` plus harness commit `d39f0be` (candidate-first, `forgeniq-platform-staging` only) |
| Previous official (rollback) | `dpl_AYxsE2eoey1myX1SDFfgBSidsCTT` (live-enabled pilot deployment; retained, not deleted) |
| Gates | `qa --mode=promote` 36/36 on the final run; authenticated smoke 19/19 on candidate and official |
| Running posture (read through the authenticated readiness API) | `executionEnabled=false`, stages 2–5 `fixture`, budget 0.75 / 8 requests unchanged, ledger route `supabase_rpc`, key present but unusable while execution is disabled |
| Ledger after restore | 5 reservations, 0 open, 0 recoveries, settled 0.073476, request_count 5, reserved 0 |
| Spend and audit records | Preserved; nothing deleted |
| Paid AI elsewhere | None active: execution flag is the global gate for all use cases and is false |

Window during which paid AI was enabled on the running app: from the activation promote (before stage 1, 10:5x UTC) until the final promote (~11:41 UTC). Env was restored at ~11:08 UTC but a running deployment keeps its build-time env until promotion, so the exposure ended only at the promote. Only the pilot persona sessions used the app in that window; the ledger shows exactly the five pilot requests.

Incidents during restore (no data or security impact):
1. Attempt 1 built a candidate that passed the QA gate, then the authenticated smoke aborted: persona A's session check hit a Clerk handshake navigation ("Execution context was destroyed").
2. Attempts 2–3 failed the `UAT-SESSION-RECOVERY` gate. After retrying the navigation race, the real cause surfaced: `aiRequest` capability is withheld by design when paid AI is disabled, but persona A's preflight required it. The harness now expects `aiRequest` only while the deployment reports execution enabled (`staging-user-sessions.mjs`). Tenant security checks unchanged.
3. Attempt 4 passed all gates and promoted.
