# FG24/6 live publication-to-obligation UAT — execution checklist

Scope: **FORGENIQ AI Development** (`b8f5e3a1-00ad-4000-8000-000000000001`) only. Publication FG24/6 `ec168f48-1717-4631-8e4a-a3e95df4d5ce`, version `af28173b-f446-450b-a390-e645a554e524`, PDF revision `5138fabf-983f-4694-81d4-0336df6f4e78` (17 pages, citations `PDF p.N`). All records titled with the prefix `UAT — FG24/6`.

People:

- **A** `user_3LA76vR4CueutWtEpcAxvqYKkEv`: COMPLIANCE_MANAGER (maker, AI requester, risk/control mapping)
- **B** `user_3LIQIZlXNWBFEvSKabAYIUhhNdi`: COMPLIANCE_MANAGER (applicability/impact approver, AI acceptor, submitter)
- **C**: REVIEWER, AI Development only (independent obligation approver). **Pending: name and email, then approval to create.**

Status: **not started.** No test records, memberships or AI runs exist. Starting state (2026-11-20 15:05 UTC): AI Development has 0 changes, 0 obligations, 0 risks, 0 controls, 0 FG24/6 runs.

## Hold points (all must be ticked before step 7)

- [x] Role-aware RLS migration applied to staging and verified (2026-11-20)
- [ ] Reviewer C name and email provided, invitation and membership approved and created, C verified
- [ ] Test records (steps 1–6) authorised
- [ ] A, B and C available for steps 7–12 in one session
- [ ] Spending cap, timeout and scheduler state re-confirmed immediately before step 7

## Steps

Each step is performed in the staging application by the named person. After each step I verify the database state read-only.

| # | Who | Action | Expected | Verified under deployed policies (rolled-back probe, 2026-11-20) |
|---|---|---|---|---|
| 1 | A | Track FG24/6 for AI Development; create manual regulatory change `UAT — FG24/6 Risk-based approach to payments` | change OPEN, `CHANGE_CREATED` by A | yes (probe 01, 02) |
| 2 | A | Create applicability assessment and **submit** | IN_REVIEW, `submitted_by` = A | yes (probe 07) |
| 3 | B | **Approve** applicability (A is refused: submitter) | APPROVED, `reviewed_by` = B | yes (probe 11) |
| 4 | A | Impact assessment for the change, owner = A, **submit** | IN_REVIEW | yes (ANALYST+ write) |
| 5 | B | **Approve** impact (owner A is refused) | APPROVED | yes (ANALYST+ write; app requires COMPLIANCE_MANAGER) |
| 6 | — | Pre-run confirmation: `RI_LAB_ANTHROPIC_MAX_USD` = 1.00, `RI_ANTHROPIC_TIMEOUT_MS` = 180000, retry reserve factor unset (1), scheduler cron disabled, no other UC-RI-005 run in progress | all confirmed | — |
| 7 | A | Request **one** UC-RI-005 obligation extraction for FG24/6 (paid, one attempt, no retry). Expected reserve about $0.16 | run COMPLETED or FAILED; cost recorded; no second attempt | yes (probe 10) |
| 8 | B | Review each proposed obligation against the FCA PDF page cited. **Accept** only claims fully supported; **reject** unsupported or partially verified claims | review by B; accepted claims materialise as AI_ASSISTED **DRAFT** obligations in the existing register | yes (probes 12, 13) |
| 9 | B | **Submit** accepted obligations for review | IN_REVIEW, `ai_submitted_by_user_id` = B | yes (probe 14) |
| 10 | A, B | Attempt approval (must be refused) | A: `segregation_of_duties`; B: `segregation_of_duties` | yes (probes 15, 16) |
| 11 | C | Independently check each obligation against the original PDF, then **approve** (or return to DRAFT) | OPEN; `OBLIGATION_STATUS_CHANGED` by C; C cannot edit content | yes (probes 20, 21) |
| 12 | A | Create risk `UAT — FG24/6 …` and control `UAT — FG24/6 …`; link obligation ↔ risk, obligation ↔ control, risk ↔ control | links persisted; `RISK_LINKED` / `CONTROL_LINKED` by A | yes (probe 23); C refused (probe 22) |
| 13 | me | Read-only audit evidence (below) | complete | — |

## Audit evidence to collect (read-only)

1. Change, applicability, impact: statuses, submitter/approver, timestamps.
2. AI run: use case, publication version, requester, execution status, duration, tokens, calculated cost vs reserve vs cap, attempt count = 1.
3. Citations and the review: accepted and rejected claim indexes, reviewer B, notes on PDF verification.
4. Materialisations: one row per accepted claim → obligation ID.
5. Obligations: origin AI_ASSISTED, created_by B, submitted_by B, approved by C, final status OPEN, citation `PDF p.N`.
6. Refusals: A and B approval attempts refused (application response and absence of state change).
7. Risk/control links.
8. Ordered `workflow_events` for all UAT entities, each attributed to its actor.
9. Other organisations: row counts and checksums unchanged versus the 2026-11-20 recovery point.
10. Scheduler still disabled; no UC-RI-002 run exists.

## Pass criteria

At least one valid proposed obligation with verifiable regulatory evidence; independently approved by C; present in the existing register; risk and control links persisted; complete audit trail; unauthorised approvals refused; other organisations unchanged; spend within the cap. Incomplete extraction or partially verified citations are not treated as definitive regulatory evidence.
