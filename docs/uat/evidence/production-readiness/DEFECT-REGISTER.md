# Defect register

Severity: Critical, High, Medium, Low. Status: RESOLVED (fixed, tested, evidenced), OPEN, BLOCKED (needs external action).

## Resolved in remediation tranche (27 Nov 2026)

| ID | Fix |
|---|---|
| SEC-001 | Stage 2 approval pin + RPC enforcement; 74-check atomic suite |
| OPEN-008 | Master triple output → `docs/uat/qa/transient/` |
| DEF-011 | Audit history 20s timeout fallback |
| P1-sched-config | Vercel crons in repo; phase8d4 updated |
| P7-nav | Collapsible sidebar shell (Design Lab) |

## Resolved in this programme

| ID | Sev | Defect | Root cause | Evidence |
|---|---|---|---|---|
| DEF-001 | High | Obligation approval and Stage 2 creation not atomic | two separate writes | RPC `approve_obligation_with_stage2` (migration applied to staging); `S1-APPROVE`, `B-UI-ATOMIC-STAGE2-HANDOFF` |
| DEF-002 | High | Registers disagreed by scope; risks, controls and changes ignored `scope`; operational view leaked UAT rows | per-route heuristics instead of one provenance rule | `scopeRegister`; `RI-LAB-SCOPE-REGISTERS` 92 checks (mutation-verified) |
| DEF-003 | Medium | Assurance not linked to its control in lists | lineage stored in `sourceApprovedControlId` plus a link table that no list read | mapper fallback + `withAssuranceControlLinks`; hosted `S5-PLAN`, browser link checks |
| DEF-004 | Medium | Assurance review always displayed `DRAFT` | UI read the test result, not workflow status | `assuranceStatus` exposed; `C-ASSURANCE-WORKFLOW-STATE` PASS |
| DEF-005 | Medium | Audit history of Assurance, Finding and Evidence wiped after load | detail request cleared the cached events | detail fetchers no longer clear; `RI-DESIGN-LAB-AUDIT-HISTORY-RACE` (CI catalogue); hosted PASS |
| DEF-006 | Medium | Promote gate hung after PASS in `RI-GOV-RISK-SOD` | suite discarded the embedded Postgres handle | handle passed to `stopEmbedded`; suite exits in about 16 s |
| DEF-007 | Medium | Nine acceptance suites failing or broken outside the CI catalogue | see below | all repaired and re-run |
| DEF-008 | Medium | Ask RI, evidence-upload, AI-guard and triage suites were not gated, so they decayed unnoticed | not in catalogue | added: `RI-ASK-RI-PIPELINE-STAGE-C`, `RI-EVIDENCE-UPLOAD-SAFETY`, `RI-ANTHROPIC-SPEND-GUARD-PROVIDER`, `RI-TRIAGE-SCREENS` (catalogue now 60 entries, 45 CI) |
| DEF-009 | Low | Regulatory calendar unavailable in connected Design Lab (placeholder only) | no tenant calendar API | `GET /api/ri-lab/calendar` + connected view; `RI-LAB-CALENDAR` 41 checks; browser PASS |

DEF-007 detail (none of these was a product regression):

| Suite | Cause | Resolution |
|---|---|---|
| `acceptance-anthropic-provider`, `acceptance-ri-ai-run-finalisation` | stale against the spend guard (use case outside ledger; ledger required) | assert the refusal; mocked success under the in-process ledger |
| `acceptance-phase-8-bus-uat-018-ask-ri-pipeline`, `...-publication-title` | expected `ANSWERED`; Stage C policy caps cited catalogue answers at `PARTIAL_ANSWER` while human review is pending or the source is non-binding | assert the current policy (cap applies only under those conditions; otherwise `ANSWERED`) |
| `acceptance-phase-8c-step-80d-ask-ri-production` (and `lib/ri/eval/build-offline-evidence-fixtures.mjs`) | imported `integrations/regulatory-sources/fixtures/cp26-38-minimal-pdf.mjs`, which was never committed on this branch | restored the synthetic offline fixture (labelled "not the live FCA document") |
| `acceptance-phase-8-step-83f1-evidence-upload-safety` | outer test spawned a `.run.mjs` that was never committed | wrote it: 23 mocked-runtime checks (ordering, compensating cleanup, refusals); mutation-verified |
| `acceptance-platform-foundation`, `acceptance-ri-master`, `acceptance-ri-master-triple` | allow-list missed `lib/design-lab-static.ts` (public URL path, no import); master suites depend on it | allow-list updated; passes on a clean tree |
| `acceptance-ri-triage-screens` | guard applied to the whole file after `resolvedSegment` became a legitimate local | guard narrowed to the loader code where the original ReferenceError lived |

## Open

| ID | Sev | Item | Needed |
|---|---|---|---|
| OPEN-001 | Medium (narrowed) | Connectors **39/41 current**; **VERCEL_CRON** evidenced **2026-11-27T04:00:24Z** (ENG-CRON-001 resolved). **Residual:** due-source ingest tick not captured; OFAC-SDN disabled; CBUAE no connector | capture cron with `dueCount > 0`; policy for CBUAE/OFAC |
| OPEN-002 | **High, release blocker (external)** | Regulatory accuracy NOT_ASSESSED; no regulatory-expert review | professional review; no approval is claimed |
| OPEN-003 | High, BLOCKED | Hosted cross-tenant denial unproven (`SEC-CROSS-TENANT`) | second tenant plus user access (approval required) |
| OPEN-004 | Medium | **8** OPEN obligations remain DISCONNECTED after tranche C: **7** legacy MANUAL in FORGENIQ main org + **1** partner org; **10** AI-dev pilot rows repaired to LINKED (`repair-disconnected-2026-11-27`) | owner decision for 7 legacy; partner row unchanged. Not bulk-backfilled |
| OPEN-005 | Medium | Only REG-FCA has an approved classification policy | extending it is a material classification-policy change that needs approval |
| OPEN-006 | Medium | External notification delivery off; **in-app** tenant notifications verified on staging (`notifications-in-app-2026-11-27`) | enable external fan-out only when product authorises |
| OPEN-007 | Medium — **RESOLVED staging** | Reviewer RPC Stage 2 content smuggling | Migration `20261127083000_reviewer_stage2_approval_pin`; promote gate `RI-OBLIGATION-OPEN-ATOMIC` |
| OPEN-008 | Medium (process) | Acceptance suites rewrite committed `docs/eval/*` evidence when run (restored after each sweep) | write suite output to an untracked directory |
| OPEN-009 | Medium | DEF-011 below | investigate |
| OPEN-010 | Low — **PARTIAL** | Reports: executive/board API routes verified offline (`RI-REPORTS-OPEN-010`); **scheduled** reports and board-pack export **not** implemented/verified | hosted export UAT when scheduled product scoped |
| OPEN-011 | Info, not a defect | No billing or onboarding routes (Phase 18); live billing must stay off | design and approval |
| OPEN-012 | Low | Effective hosted AI model is a Secret value and cannot be read back | confirm on first authorised run |

**DEF-011 (OPEN-009), Medium:** intermittent, unexplained "Loading workflow events from staging…" on the first hosted visit to a freshly created assurance review; the events endpoint was fast and the state did not recur in three fresh-record runs or two network-logged reproductions. Diagnostics are now captured automatically if it recurs.

## Sweep status (186 acceptance suites, run without any provider or privileged credentials)

First pass: 174 passed, 11 failed, 1 timed out. Nine of the failures were stale or broken tests and are repaired and re-run green (`ri-master-triple` result is recorded in `EXECUTIVE-READINESS-REPORT.md`). Remaining, **BLOCKED not failed**:

- `acceptance-pdf-grounded-uc-005`: needs Supabase admin credentials, which the sweep deliberately withholds.
- `acceptance-stage-a-e2e-persistence`: a live paid-provider test (240 s timeout without a key). Not run: paid AI is disabled.

A complete second sweep was not repeated; the repaired suites were re-run individually, and the promote gate (52/52) ran against the final code.
