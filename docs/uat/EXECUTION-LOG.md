# UAT execution log

Decisions, reasons and outcomes taken under `.cursor/rules/forgeniq-autonomous-execution.mdc`. Newest first.

## 2026-11-22 — Staging regression, remediation, preflight (no paid extraction)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | `staging-p2-regression.mjs` | User Priority 1 browser regression | **19/19 pass** — `docs/eval/STAGING-P2-REGRESSION-2026-11-22.json` |
| — | Remediate 4 OPEN PS26/1 obligations | Unsupported wording vs verified quotes | Controlled DRAFT→IN_REVIEW→OPEN per obligation; audit events preserved (7–8 each) |
| — | CONC 7.20.1R(2) deterministic test | No paid extraction | Cross-page quotation verify **pass**; staging run still lacks index until re-extraction |
| — | PS22/9 preflight | R+E+G publication for later UAT | `docs/eval/PS22-9-PUBLICATION-PREFLIGHT.json` |
| — | Hold paid extraction (0/2) | CLS-005 negative browser + 7.20.1R conversion on staging still open | Continue when gates clear |

## 2026-11-22 — Staging DB migration + local regression gate

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Fix `ri_submit_ai_finding_review` claim SHA vs obligation statement | `claimTextSha256` must bind to AI finding text, not reviewer obligation wording | Migration `20261122121500` corrected; insert uses `coalesce(obligation_statement, claim_text)` |
| — | Local acceptance | Spending gate prerequisite | `acceptance-ri-ai-finding-review-service` 32/32; `acceptance-ri-provision-eligibility-local-db` 47/47 |
| — | Apply migration on staging Supabase | Authorised staging release (DB half) | `forgeniq-ri-staging` (`lhgzdicffkhaaykzthep`): `ri_obligation_statement_cross_page` applied via management API |
| — | Staging platform deploy | Authorised release (app half) | Vercel prod `dpl_CsCGHbQPjCzZtEBLNHGvMWjp6UJ9` → `https://staging-app.forgeniq.com` (local worktree upload; design-lab bundle synced pre-deploy) |
| — | Pause before paid extractions | Post-deploy browser regression + staging creds for preflight | **Checkpoint:** session UAT scripts + obligation remediation; then ≤2 paid extractions |

## 2026-11-22 — Regulatory accuracy + workflow defect implementation (local)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Implement RI-UI-007, RI-CLS-009, RI-UI-006/008/001/002 in dev worktree | User autonomous execution instruction Priority 1–2 | Code + migration `20261122121500`; design-lab bundle synced |
| — | Audit four PS26/1 OPEN obligations | Regulatory accuracy sign-off outstanding | At least 2/4 fail `obligation_statement_exceeds_evidence` — see `docs/eval/PS26-1-OBLIGATION-WORDING-AUDIT.json` |
| — | Pause before staging migration + paid extractions | Spending gate: deploy + validate before ≤2 paid runs | DB migration complete; app deploy outstanding |

## 2026-11-22 — Cursor autonomous environment + UAT resume

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 11:12 | Desktop Run Mode → Auto-review; Agent `fullAutoRun` off, `smartModeAutoRun` on | User requested autonomous dev without Run Everything | Patched `state.vscdb` (backup `state.vscdb.bak-20261122-111229`); `enableSmartAuto=true`, `yoloEnableRunEverything=false` |
| 11:12 | CLI `approvalMode` → `auto-review`; add `~/.cursor/permissions.json` hints | Supported JSON surfaces for classifier + CLI | `cli-config.json` and new `permissions.json` |
| 11:13 | Copy `forgeniq-autonomous-execution.mdc` into Brieftick workspace `.cursor/rules` | Current Cursor window is Brieftick; rule must alwaysApply here too | Rule active in both Brieftick and forgeniq worktree |
| 11:14 | Resume UAT: session verify + regulator policy fail-closed read | No new paid AI authorised | A/B/C VALID; only REG-FCA has ACTIVE policy on staging (FRC/ICO/PSR/PRA fail closed as expected) |

## 2026-11-22 — PS26/1 authenticated UAT (staging)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 10:53 | User B submits the review as proposed (Option A): 4 conversions, 9 triaged | Selected by the user | Review `0df275ef` recorded, 13 decisions, 4 DRAFT obligations. A duplicate POST from the same click was refused (409); logged as RI-UI-006 |
| 10:53 | Hold Finding 1 (CONC 7.20.1R) in Exception Triage instead of converting | The duty in 7.20.1R(2) is on p.95 but the parser attributes the provision to p.94, so it cannot be grounded on its page | Logged as RI-CLS-009; the duty needs manual registration |
| 10:54 | Script fix: wait for the obligation-specific panel before editing | The first pass edited a stale form after SPA navigation (3 × DRAFT→DRAFT no-op events) | All four obligations IN_REVIEW, submitted by A |
| 10:56 | Run the negative control: B (acceptor) attempts approval | Security validation is authorised; confirms segregation of duties before the real approval | 403 `segregation_of_duties`, no change |
| 10:56 | User C approves all four into the register | Agreed UAT sequence | All four OPEN |
| 11:00 | Use C's screenshot as register evidence; keep B's as defect evidence | B's view showed a stale IN REVIEW status even after a reload (cached detail never revalidated) | Logged as RI-UI-008 |
| 11:05 | Close RI-CLS-006; keep RI-CLS-005 open | 006's outcome (instrument-first selection, coverage reported) was reproduced on staging; 005's refusal path was not exercised in the browser on staging | Backlog updated |
| — | No further paid AI calls | Only one extraction was authorised; the E test and a second binding run need new approval | Stopped at a mandatory approval checkpoint |
