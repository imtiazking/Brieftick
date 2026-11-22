# UAT execution log

Decisions, reasons and outcomes taken under `.cursor/rules/forgeniq-autonomous-execution.mdc`. Newest first.

## 2026-11-22 — Standing autonomous rule + PS22 E closure

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Update `forgeniq-autonomous-execution.mdc` | User standing authorisation | Brieftick + `forgeniq-ri-classification` worktrees |
| — | PS22 authoritative quotes (p.126) | AI IGC text ≠ instrument 2A.4.35E | Review run `3ed8c3e2` — R `2046ef71`, E `7143f1ff`, link **not** `68051a63` |
| — | Maker-checker approve R+E | RI-CLS-004 positive path | Both OPEN; `PS22-9-EVIDENTIAL-BINDING-CORRECTION-2026-11-22.json` |
| — | `acceptance-ri-provision-source-verification-ps22.mjs` | Deterministic 35E gate | **3/3**; fixture `fca-ps22-9-official.pdf` |

## 2026-11-22 — P3 milestone acceptance (staging deploy + CONC close)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 15:46 | Staging platform deploy (provision engine + hotfix) | Authorised release | `dpl_HBUQgkWr4Eofg2ws1PtWjHRaevrY`; batch-plan API 200; `STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json` |
| — | Fix `instrumentProvisionsSupplied` count misuse | Batch-plan API 400 on staging | `build-pdf-grounded-analysis-context.mjs` uses `uniqueSupplied` cores array |
| — | Post-deploy verify + P2 regression | CONC index + workflow | **4/4** verify checks; **19/19** P2 — `STAGING-P3-PROVISION-ENGINE-VERIFY-2026-11-22.json` |
| — | `complete-conc a06eb008` (no paid AI) | Authoritative 7.20.1R(2) p.95 quote | OPEN obligation `96dd98d9-ad1e-4549-8a74-a82591b94db1` |
| — | PS22 evidential correction | No link to `68051a63` | Refusal probe **400**; positive E blocked on `finding_quotation_not_found_on_page:18` — `PS22-9-EVIDENTIAL-BINDING-CORRECTION-2026-11-22.json` |
| — | Simulated publication PS26/1 | RI-CLS-007 gate | **6/6** checks — `FULL-PUBLICATION-SIMULATED-P3-2026-11-22.json` |
| — | Checkpoint doc | Single gate for paid retry | `docs/uat/P3-CHECKPOINT-2026-11-22.md` |

## 2026-11-22 — P3 provision engine (no paid AI)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | PS26/1 source verification | User: compare original FCA PDF to pipeline | Official PDF p.94–95 contain 7.20.1R(1) and (2); legacy “contact the customer” quote **absent** — `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json` |
| — | `buildProvisionPagesIndex` fix | 7.20.1R(2) on p.95 before 7.20.2G/7.20.3R on same page | Index now **[94, 95]**; provision DB **47/47** |
| — | Provision inventory module | Track identified → supplied → finding / unresolved | `provision-inventory.mjs` + orchestration reconciliation |
| — | Classification policy core | 4 fails = `obligationStatement` vs claim paraphrase | **116/116** with grounded fixture statements (verification unchanged) |
| — | PS22/9 p.126 check | 35E in official PDF | `PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json`; 2A.4.13R not on same page (link via OPEN obligation only) |
| — | E conversion plan | No unrelated links | `E-PROVISION-CONVERSION-TEST-PLAN-2026-11-22.json` |
| — | Milestone | Consolidated P3 report | `MILESTONE-REPORT-2026-11-22-P3-PROVISION-ENGINE.md` |

## 2026-11-22 — Authorised paid tranche (≤$2 combined, P2 acceptance)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | CONC preflight + paid extract `uat-ps26-1-conc-7201r2-001` | User-approved PS26/1 7.20.1R(2); pages 94–95 in batch0 | ~$0.032 est.; run `a06eb008…` COMPLETED; batch targeted cores 7.20.1R/7.20.3R |
| — | CONC human review (finding 7) | Cross-page RI-CLS-009; no retry after marker | Refused `finding_quotation_not_found_on_page:7` — staging excerpts lack verified 7.20.1R(2) quotation |
| — | PS22 E preflight + paid extract `uat-ps22-9-e-35e-001` | Approved second slot; cores 2A.4.35E/2A.4.13R | ~$0.048 est.; run `3ed8c3e2…` COMPLETED (transport reuse after ECONNRESET) |
| — | PS22 E conversion | Policy: no unrelated binding link | **Skipped** — no finding cites 35E with suitable evidential text; p.126 findings are 2A.4.34R/36R |
| — | Regression | Final validation | Orchestrator **6/6**, engine **13/13**, e2e **8/8**, batch plan **5/5**, provision DB **47/47**; policy core **112/116** (4 fixture failures) |
| — | Evidence | UAT backlog | `TARGETED-PAID-EXTRACTION-TRANCHE-2026-11-22.json`; `completeConc` uses cross-page finding picker + `supporting-obligation` for E |

## 2026-11-22 — Milestone P2 (priorities 1–4, no paid AI)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | RI-CLS-007 workflow completion | User P1: simulated gate before paid AI | `advanceOrchestrationBatch`, `runOrchestrationBatchesAutomatic`, consolidated review; e2e **8/8** — `RI-CLS-007-EXTRACTION-WORKFLOW-MILESTONE.json` |
| — | RI-CLS-005 evidence | User P2 consolidate negatives | `RI-CLS-005-NEGATIVE-CONVERSION-EVIDENCE.json`; provision eligibility **47/47** |
| — | Paid extraction plan | User P2 targeted scenarios only | `PAID-EXTRACTION-COSTED-TEST-PLAN-2026-11-22.json` (CONC 7.20.1R(2) + PS22/9 E) |
| — | PS22/9 approval chain | User P2 verify | Obligation `68051a63` **OPEN** on staging |
| — | Classification policy audit | User P3 no unverified activation | FRC audit + PRA/ICO/PSR draft docs only — `REG-FRC-POLICY-AUDIT-2026-11-22.json`, `REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json` |
| — | Governance P4 | OP2 change + admin writes | Approval record `PLATFORM-OPERATOR-CHANGE-APPROVAL-RECORD-2026-11-22.json`; **SEC-GOV-001** backlog; admin writes **disabled** on staging |
| — | Platform deploy | RI-CLS-007 API | `dpl_2p7c3UJYht3NAGPkvaKVzThdUfP6` → staging-app.forgeniq.com (orchestration advance + bundle UI) |

## 2026-11-22 — No-cost continuation (post paid-extraction cap)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Staging `platform_operators` correction | User-approved staging-only fix | Reactivated `user_3LA76vR4` (forgeniq@gmail.com); revoked dev `user_3LIQIZl…` (row kept); added OP2 `user_3LBBtwYR4` (forgeniq@yahoo.com) — `PLATFORM-OPERATOR-STAGING-CORRECTION-2026-11-22.json` |
| — | RI-CLS-003 staging UAT complete | Maker-checker + admin writes | `RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED=true` + redeploy; `classification-policy-admin-staging.mjs` **pass** — FCA v4 propose/activate, REG-FRC active, SoD **403**, tenant B **403**, audit 118 events |
| — | Staging platform operator Clerk verification | User: identify email before any sign-in prompt; do not use dev Clerk id | Hosted staging Clerk user **forgeniq@gmail.com** → `user_3LA76vR4CueutWtEpcAxvqYKkEv` (live session); DB row **revoked**; active row `user_3LIQIZl…` is dev-only — `PLATFORM-OPERATOR-STAGING-CLERK-VERIFICATION.json`; OP1 persona retargeted to staging user id |
| — | P2 regression (no-cost) | Continue unblocked staging tests | **19/19** — `STAGING-P2-REGRESSION-2026-11-22.json` |
| — | OP1 persona + headed login | RI-CLS-003 requires platform_operator session | **Do not sign in as** `user_3LIQIZl…`; after `platform_operators` fix, OP1 headed login = **forgeniq@gmail.com** |
| — | PS22 obligation 68051a63 A→C | Priority 2 approval chain | Status **OPEN** on staging; **4** workflow events; run `728338c4` + review `4a8a39ae` intact — `PS22-9-OBLIGATION-APPROVAL.json` |
| — | RI-CLS-007 engine acceptance | Simulated multi-batch (no paid AI) | `acceptance-ri-publication-extraction-engine.mjs` **11/11** (+ cross-page fixture, dedupe, spend cap, resume) |
| — | E provision pathway | No positive E without paid extraction | `E-PROVISION-UAT-PATHWAY.json` — **not tested** |
| — | CONC 7.20.1R(2) | User: keep open | `CONC-7.20.1R-CROSS-PAGE-OPEN.json` — infrastructure preserved; AI conversion still open |
| — | Staging reconciliation | Final tranche | `STAGING-UAT-RECONCILIATION-2026-11-22.json`; UC-RI-005 runs today = 3 (incl. prior `uat-ps26-1-001`); **no new paid calls** |
| — | P2 regression re-run | Session B transient 401 | **19/19** pass |

## 2026-11-22 — Six-workstream staging tranche (2/2 paid extractions consumed)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Set `RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES` + redeploy staging | Authorised suffixes `uat-ps26-1-cross-page-002`, `uat-ps22-9-001` | Vercel production env override; deploy `staging-app.forgeniq.com` |
| — | PS26/1 paid run `uat-ps26-1-cross-page-002` | WS1 cross-page AI conversion test | Run `7191c8b5…` COMPLETED; citations lack p.94/7.20.1R; convert refused `finding_provision_not_in_cited_section:1` — **no manual substitute** |
| — | PS22/9 paid run `uat-ps22-9-001` | WS2 comprehensive UAT after preflight | Run `728338c4…` COMPLETED; negative API probes pass; review `PARTIALLY_ACCEPTED` → PRIN 2A.4.13R obligation `68051a63…`; **E positive not in partial corpus** |
| — | RI-CLS-007 orchestration API + UI | Full workflow beyond batch plan | `extraction-orchestration` route; Design Lab ledger panel; local orchestrator acceptance **6/6** |
| — | DB integrity regression | Placeholder migration incident | `acceptance-ri-rpc-migration-canonical` + `apply-supabase-migrations` placeholder guard; staging function verified |
| — | RI-CLS-003 staging admin UAT | Use existing accounts only | **Blocked:** tenant A/B/C are not `platform_operators`; active operator not in saved sessions — local admin acceptance remains evidence |
| — | `staging-p2-regression.mjs` post-deploy | Consolidated gate | **19/19** — `docs/eval/STAGING-P2-REGRESSION-2026-11-22.json` |
| — | Programme completion | Functionality not fully evidenced on staging WS1 + WS2 E + WS3 | **Not complete** — see `docs/eval/SIX-WORKSTREAM-2026-11-22.json` |

## 2026-11-22 — Critical staging restore: `ri_submit_ai_finding_review` cross-page (RI-CLS-009)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Apply `restore_20261122163000_ri_cross_page_provision_citation` on staging | `migration_apply_incomplete` / missing `v_provision_section` in live function | Supabase `lhgzdicffkhaaykzthep`: apply_migration **success**; verify `pg_get_functiondef(...) like '%v_provision_section%'` → **ok: true** |

## 2026-11-22 — Staging regression, remediation, preflight (no paid extraction)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | `staging-p2-regression.mjs` | User Priority 1 browser regression | **19/19 pass** — `docs/eval/STAGING-P2-REGRESSION-2026-11-22.json` |
| — | Remediate 4 OPEN PS26/1 obligations | Unsupported wording vs verified quotes | Controlled DRAFT→IN_REVIEW→OPEN per obligation; audit events preserved (7–8 each) |
| — | CONC 7.20.1R(2) deterministic test | No paid extraction | Cross-page quotation verify **pass**; staging run still lacks index until re-extraction |
| — | PS22/9 preflight | R+E+G publication for later UAT | `docs/eval/PS22-9-PUBLICATION-PREFLIGHT.json` |
| — | Hold paid extraction (0/2) | CLS-005 negative browser + 7.20.1R conversion on staging still open | Continue when gates clear |

## 2026-11-22 — Six-workstream delivery (local + staging RPC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | RI-CLS-009 cross-page RPC + JS triage | CONC 7.20.1R(2) quotation on p.95 with provision set-out on p.94 | Migration `20261122163000`; local provision acceptance **47/47** incl. cross-page convert on p.95 |
| — | RI-CLS-007 multi-batch plan module | Remove 18-section as sole coverage story without batch orchestration | `extraction-batch-plan.mjs`, `buildPdfGroundedAnalysisContext` batch params, GET `extraction-batch-plan`, coverage UI panel |
| — | Restore staging `ri_submit_ai_finding_review` | Erroneous placeholder migration briefly raised `migration_apply_incomplete` | `restore_20261122163000_ri_cross_page_provision_citation` applied; `v_provision_section` verified |
| — | CONC 7.20.1R staging conversion | Existing PS26/1 run already reviewed (`already_reviewed`) | **Limitation:** conversion proves on local DB + client triage; staging needs new run (1 of ≤2 authorised extractions) or manual register |
| — | Staging deploy pending this tranche | Bundle synced | **Next:** Vercel deploy + `staging-p2-regression.mjs` + consolidated UAT evidence |

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
