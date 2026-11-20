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
- [x] Test records authorised (change, applicability, impact; risk and control after approval) — 2026-11-20 15:39 UTC
- [ ] Steps 1–5 completed and verified
- [ ] Explicit execution confirmation for the paid UC-RI-005 call
- [ ] A, B and C available for steps 7–12 in one session
- [ ] Spending cap, timeout and scheduler state re-confirmed immediately before step 7

## Authorisation (2026-11-20 15:39 UTC)

Authorised: one regulatory change, one applicability assessment, one impact assessment, and — after obligation approval — one risk and one control, all titled `UAT — FG24/6`, created through the existing authenticated workflows in AI Development only. Not authorised: triage/tracking records, extra changes, memberships (pending reviewer details), the paid UC-RI-005 call (pending explicit confirmation).

Duplicate check before step 1 (2026-11-20 ~15:45 UTC): 0 `UAT — FG24/6` changes/risks/controls in any organisation; 0 FG24/6 changes, applicability or AI runs in AI Development; PDF revision present. I re-run this check immediately before each create step; if a matching record exists, the step is skipped and the existing record reused.

## Exact values (operator sheet)

Sign in to `https://staging-app.forgeniq.com`, select organisation **FORGENIQ AI Development**, open the Design Lab (Regulatory Intelligence). Each person uses their own account.

**Step 1 — A: regulatory change** (Changes → Create change)

- Publication: `FG24/6: Guidance for firms that enables a risk-based approach to payments`
- Title: `UAT — FG24/6 Risk-based approach to payments`
- Change type: `GUIDANCE`
- Description: `Controlled UAT record for the first live publication-to-obligation test (FCA FG24/6). Not a firm regulatory determination.`
- Materiality, effective date, deadline: leave blank (not fabricated)
- Status: `OPEN`
- Creation mode: `UAT authorised` (if the app reports `authorised_uat_change_creation_disabled`, stop and tell me — do not switch mode without agreement)
- Record the change ID shown after save (needed for step 7)

**Step 2 — A: applicability** (FG24/6 publication → Publication-level applicability)

- Recommendation: `APPLICABLE`
- Rationale: `UAT — FG24/6: designated applicable to FORGENIQ AI Development for the controlled publication-to-obligation test. Test organisation; not a firm regulatory determination.`
- Save, then **Submit for approval**

**Step 3 — B: approve applicability** (Governance → pending approvals). A must not approve (blocked: submitter).

**Step 4 — A: impact assessment** (on the UAT change → Impact assessment)

- Owner: A
- Business/operational/compliance impact: `UAT — FG24/6 controlled test; impact to be confirmed from approved obligations.`
- Materiality: leave blank
- Save, then **Submit for review**

**Step 5 — B: approve impact**. A must not approve (blocked: owner).

**Step 7 — A: extraction** (FG24/6 publication → AI Analysis → Extract candidate obligations (UC-RI-005)) — **only after you confirm execution**

- Parent regulatory change ID: the step 1 ID
- Idempotency suffix: `uat-fg24-6-001` (a repeated click returns the same run; never change the suffix to retry)
- Click **Extract obligations** once. Do not retry on failure or timeout; report the outcome.

**Step 8 — B: review** (AI review queue → the run)

- For each candidate, open the cited `PDF p.N` of FG24/6 and compare the quotation and statement.
- Citation `VERIFIED` and statement fully supported → accept.
- Citation `PARTIAL` → accept only if B confirms the full requirement on the cited page; otherwise reject.
- Unsupported, paraphrased beyond the source, or non-binding text presented as a requirement → reject.
- Record verification notes in the review notes (page and quotation checked).

**Steps 9–12** as in the table below. Risk title `UAT — FG24/6 Fraud-risk payment delay risk`, control name `UAT — FG24/6 Payment delay review control` (adjust wording to the approved obligation; prefix must remain `UAT — FG24/6`; creation mode `UAT authorised` where offered).

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
