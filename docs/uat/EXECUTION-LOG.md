# UAT execution log

Decisions, reasons and outcomes taken under `.cursor/rules/forgeniq-autonomous-execution.mdc`. Newest first.

## 2026-11-23 — Embedded PG isolation + preflight regression (14:36 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 14:36 | Embedded PG harness | Cross-process delete races | Session dirs + owner file; orphan-only cleanup; master-triple lock |
| 14:36 | PS22 preflight regression | 7380-token invalid JSON | `acceptance-ri-uc-ri-005-preflight-regression.mjs` **PASS** (69-prov batch now fail-closed) |
| — | RI master ×3 | Run in flight `442341` | Allow to complete before next triple with lock |
| — | Paid PS22 | Policy | No additional paid runs; forecast `PS22-FULL-PUBLICATION-COST-FORECAST-2026-11-23.json` |

## 2026-11-23 — PS22 reconcile + preflight retune (14:25 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 14:25 | PS22 batch 0 reconcile | Run `3872aebf…` | **FAILED** invalid/truncated JSON @ **7380** out tokens; **$0.136**; no auto-retry |
| — | Output preflight | Underestimate vs live verbosity | Retuned `estimateStructuredOutputTokens`; truncation classification in lab provider |
| — | RI master ×3 | Run 1/3 in progress | Phase 7+ after hang fixes + PG cleanup at master start |
| — | SEC-DB-003 hosted | No local DB URL / token | Still blocked; `SEC-DB-003-STAGING-ACCESS-2026-11-23.json` |

## 2026-11-23 — PS22 suffix, preflight, master hang (14:08 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 13:50 | RI master triple run 2 | Stuck on Phase 7 ops (embedded PG) | Terminated; diag `RI-MASTER-HANG-DIAG-2026-11-23.json`; runner watchdog + suite timeout |
| 13:52 | `RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES` | Authorised `live-ps22-replace-batch0-2026-11-23` | 9 suffixes on `prj_y9O1A1zGFXe3GvJITnLL9mJUqve7`; evidence `PS22-SUFFIX-STAGING-2026-11-23.json` |
| 14:05 | Staging deploy | Preflight fixes | `dpl_Eh3n2x6shDpM3XhU3EUM7CTNjZe2` @ `staging-app.forgeniq.com` |
| 14:07 | PS22/9 replacement paid extract | One authorised attempt | Run `3872aebf…` **FAILED** `AI_OUTPUT_SCHEMA_INVALID`; **$0.136** (no auto-retry) |
| — | SEC-DB-003 hosted DB harness | No local `STAGING_DATABASE_URL` | `SEC-DB-003-STAGING-ACCESS-2026-11-23.json` |
| — | RI master ×3 | Phase 3A reproducibility flake | Run 1/3 fail embedded PG `base/5/16977`; re-run pending |

## 2026-11-23 — Staging tests resumed (13:20 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 13:20 | Git on `platform` | Operator disconnect | Evidence `PLATFORM-STRAY-PROJECT-GIT-DISCONNECT-2026-11-23.json`; no new stray deploys |
| 13:20 | PS26/1 hosted reconcile | Staging `0fccf47` | **PASS** — 47/47, 0 unresolved, **7/7 exceptions** incl. `16.1.6R` |
| — | PS22/9 replacement | Authorised suffix | Completed tranche above |
| — | RI master ×3 run 2 | Phase 7 hang | Terminated; see 14:08 entry |

## 2026-11-23 — Stray Vercel project `platform` (12:50 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 12:19 | Git Production deploy | CLI created `platform` + GitHub link; push `0983c8a` | **Error** — root `npm run build` missing; **no** www/staging alias impact |
| 12:50 | Deploy safety | Prevent recurrence | `VERCEL-DEPLOY-SAFETY.md`, `assert-vercel-staging-target.mjs`, Cursor rule; operator must disconnect Git on stray `platform` |

## 2026-11-23 — PS26 reconcile + FCA benchmark (12:18 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 12:11 | PS26 restore reconcile | Stale `coverageReconciliation` vs outcomes | 47/47 supplied; **0 unresolved** in `provisionOutcomes`; six of seven justified exceptions on staging (16.1.6R still `no_obligation` until deploy `80cb34b`) |
| 12:18 | FCA accuracy harness | Verified evidence | `FCA-EXTRACTION-ACCURACY-BENCHMARK-2026-11-23.json`: recall **0.33** (1/3 gold binding rules cited), precision **~0.085**, processing coverage **1.0** |
| — | Staging deploy | `80cb34b` | **Blocked** — Vercel upload ENOENT from `.local-pg-verify` during RI master ×3 (`.vercelignore` fix committed) |
| — | PS22/9 replacement | User A session | **Blocked** — HTTP 401 mid-triple; no auto-retry |

## 2026-11-23 — RI master Phase 7C.6A fix

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | `workflow-phase-7c6a.mjs` | `ri_guard_ai_pilot_run_insert` + review SoD | Pilot org `b8f5e3a1…`, USER_B reviewer, USER_C cross-tenant — **PASS** |
| — | RI master ×3 | Run 1 failed on 7C.6A | Triple re-run started after fix |

## 2026-11-23 — Autonomous tranche (08:24 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 08:24 | Commit `e0d1994` | Pilot + durability + harness | Poll fix, PDF batch fallback, stale AI recovery, master port retry |
| 08:24 | Batch 0 reconcile | No duplicate paid POST | `PS26-1-BATCH-0-RUN-RECONCILIATION-2026-11-23.json` |
| 08:25 | Pilot resume | Batch 0 marker reuse | **COMPLETED** 40/47; batch 1 `internal_error` on pre-deploy runtime |
| 08:24 | RI master ×3 | P2 gate | Run 1/3 started (background) |
| — | Staging deploy | `vercel deploy` token invalid; MCP 0 projects | **Blocker** until operator auth |
| — | SEC-DB staging | No `STAGING_DATABASE_URL` locally | Partial: Supabase trigger inventory + local 5/5 |

## 2026-11-23 — Production readiness programme (continued)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Async UC-RI-005 dispatch | ECONNRESET on long POST | `202` + `after()` + idempotency GET; commit `2707ac6`; staging `dpl_Hrtx7ABax…` |
| — | Phase 3A harness | Windows shared memory | Random ports + retry — **PASS** ×2 |
| — | FRC suspension | P3 maker-checker | REG-FRC v**2** active, all conversion disabled — evidence JSON |
| — | Admin writes | Policy hygiene | Re-enabled for suspend; env restored **false** |
| — | Regulator matrix | P4/P5 | `REGULATOR-READINESS-MATRIX-2026-11-23.json` (36/41) |
| ~01:01 | Live pilot batch 1 POST | Staging `500 internal_error` on second paid batch (batch index 1) | Batch 0 **COMPLETED** after poll fix (40/47 supplied); batch 2 suffix authorised |
| ~01:40 | RI master / Phase 5 | Fixed port `54328` stuck shared memory after long master run | Harness: retry random port when preferred port fails |
| ~01:01 | PDF batch-2 grounding | Suspected empty block filter after batch plan | Page-based block fallback + 422 mapping for `pdf_*` / `extraction_batch_*` (deploy pending) |
| ~00:58 | Live pilot false TIMEOUT | Poll read `body.run.execution_status`; API exposes `aiAnalysisRun.executionStatus` (`Completed`) | Run `2c840c0b…` already **COMPLETED**; pilot failed closed (no paid retry) |
| — | Fix `pollRun` in live pilot script | Align with lab GET shape + normalize status tokens | Re-run resumed via idempotency marker |
| — | Live pilot | Async + recovery | Acceptance criteria doc added; pilot re-run after poll fix |
| — | Production decision | Blockers remain | `PRODUCTION-READINESS-REPORT-2026-11-23.md` — **NO-GO** |

## 2026-11-23 — Autonomous tranche (P1–P5 continuation)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Fix orchestration persistence | `regulatory_publications` has no `metadata`/`organisation_id` | Tenant ledger on `organisation_publications.metadata`; migration `20261122234500` applied staging |
| — | SEC-DB local acceptance | `withRlsSession` rolled back seeded rows | **5/5** `acceptance-ri-security-db-local-db.mjs` |
| — | Staging deploys | Live batch API + ledger fix | `dpl_BUpCHLg…`, `dpl_FUKYRL9…` @ `08a5833` |
| — | Register live pilot suffixes | `uc_ri_005_run_reference_not_authorised` | `RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES` extended on staging (8 suffixes) |
| — | Phase 7C.1 golden master | Auto-connect hid demo pubs in Node | Presentation mode in acceptance; `dashboard-parity.mjs` aligned — **PASS** |
| — | Live pilot attempt 1 | Advance `internal_error` (pre-fix) | 0 batches; evidence JSON fail-closed |
| — | Live pilot attempt 2 | Post suffix + deploy | Re-run `live-full-publication-extraction-staging.mjs` (in flight) |
| — | FRC suspension | OP1 session 401 | **Blocked** — `staging-user-sessions.mjs login OP1` |

## 2026-11-22 — Implementation tranche closure

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Commit remaining bundle + migration + eval | P3+ tranche closure | `feature/ri-classification-triage` — see milestone report |
| — | Migration reconcile | Avoid blind reapply | `STAGING-MIGRATION-RECONCILE-2026-11-22.json`; staging preflight ok; local **13/13** |
| — | Revert `vercel` devDependency | Lock churn | `package.json` / lock restored to HEAD |
| — | Live pilot readiness | Priority 2 no paid AI | `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-READINESS-2026-11-22.json` ~**$0.80** combined |
| — | Regulator rollout drafts | PRA/ICO/PSR/FRC | `REGULATOR-CLASSIFICATION-ROLLOUT-PLAN-2026-11-22.md` |
| — | Staging deploy + P2 | Match committed impl | See deploy JSON + `STAGING-P2-REGRESSION-2026-11-22.json` |

## 2026-11-22 — P3+ full extraction, accuracy, FCA validation

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 16:30 | Staging deploy (orchestration v2 APIs) | Authorised staging only | `dpl_DLjK7NH1QtT1BeJ7bA9jN3HHoDXT`; build fix on orchestration route types |
| — | Full simulated PS26 + PS22 | Remove 12-batch ceiling | **47/47** + **242/242** explicit outcomes; `FULL-PUBLICATION-SIMULATED-P3-2026-11-22.json` |
| — | Resumable orchestration acceptance | Multi-session gate | PS22 **1→6** batches across **6** sessions — `acceptance-ri-publication-extraction-resumable.mjs` |
| — | 35E IGC root cause + prompt scope | Priority 2 | `PS22-35E-IGC-EXTRACTION-ROOT-CAUSE.json`; scoped prompts wired |
| — | FCA final validation (read-only) | Priority 3 | **10/10** — `PS22-9-FCA-FINAL-VALIDATION-2026-11-22.json` |
| — | `staging-p2-regression.mjs` post-deploy | Priority 3 regression | **19/19** — `STAGING-P2-REGRESSION-2026-11-22.json` |

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

## 2026-11-23 — Remediation tranche (inventory, preflight, master timeouts, deploy)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 11:21 | PS26/1 seven-provision audit | User P1 deterministic validation | `PS26-1-UNRESOLVED-PROVISION-AUDIT-2026-11-23.json` — all seven batch-1 supplied; amendment/TP → exception triage |
| 11:23 | Fix provision inventory sync | False UNRESOLVED despite cumulative 47/47 | `syncProvisionInventorySuppliedFromLedger`, accumulated findings, EXCEPTION for amendment/TP; `acceptance-ri-provision-inventory-reconcile` **PASS** |
| 11:23 | UC-RI-005 output preflight | PS22 `max_tokens` JSON truncation | `extraction-output-preflight.mjs` + scaled output caps; acceptance **PASS** |
| 11:23 | Master runner timeouts | Hung Phase 8B banner | `acceptance-ri-master-runner.mjs` (20m/step kill-tree); triple **restarted** |
| 11:36 | Commits + staging deploy | P5 deployment consistency | `d46e650`, `41d7e52`, `dpl_9emxLFVY7Rj9TQgwcaJWjr35DALA` **READY** |
| 11:36 | PS22 replacement batch 0 | Authorised ≤$0.25 | Blocked: session expired + preflight refined (`maxSections=4`); pending login A |
| — | SEC-DB-003 hosted | Staging DB URL absent | Local **5/5**; staging harness needs `STAGING_DATABASE_URL` |

## 2026-11-23 — Staging deploy, continuation batch fix, live pilot, SEC-DB API

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 10:30 | Vercel deploy `dpl_5qEo4k5BbDynN5Le6Long7q1orXt` | Ship `e0d1994`/`e61581a`/manifest stack to staging | `staging-app.forgeniq.com` **Ready**; batch POST without change → `obligation_extraction_requires_parent_change` (not `internal_error`) |
| 10:33 | Pilot batch 1 | Pre-fix continuation indexing | **FAIL** `extraction_batch_out_of_range` (orchestration batch 1 vs continuation plan index 0) |
| 10:35 | Fix `buildPdfGroundedAnalysisContext` | Map continuation batches + fullPublicationCoverage when cumulative supply present | Local `acceptance-ri-extraction-continuation-batch-index.mjs` **PASS** |
| 10:38 | Deploy `dpl_7b2D9aKeN2EdGJhC4ZGp6SiCg2eS` | Staging runtime for continuation fix | Production alias unchanged |
| 10:39–10:40 | PS26/1 pilot resume | Reuse batch 0 marker; paid batch 1 only | Batch 1 **COMPLETED** `6f05a9eb-8984-4a2b-8b78-2e7effbf8892`; 47/47 supplied; 7 unresolved cores in reconciliation |
| 10:41–10:43 | PS22/9 batch 0 | First paid PS22 batch within cap | **FAILED** `AI_OUTPUT_SCHEMA_INVALID` (`max_tokens`); ~$0.155 billed — **no auto-retry** |
| 10:46 | SEC-DB staging API harness | User mandate: API-first RLS role-play | `acceptance-ri-security-db-staging-api.mjs` **6/6** (003 skip — no public DELETE); evidence `SEC-DB-STAGING-API-VALIDATION-2026-11-23.json` |
| 10:46 | Accuracy reconcile | Distinguish processing coverage vs extraction accuracy | `LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json`; spend ~$0.38 / $2 |
| — | RI master ×3 | Run 1/3 in flight since 08:56 | Log stalled at **FCA RSS Phase 8B** — follow-up: diagnose hang / restart |
| 14:44–15:00 | RI master triple **442343** | User mandate: allow to finish; count only full successes | **0/3** toward gate — master child vanished (~phase8b-fca); no `exit` event; diag `RI-MASTER-TRIPLE-442343-DIAG.json` |
| 15:02 | Runner remediation | Root cause: Windows child exit loss + fixed PG **54330** on 8B ingestion / 7C.7 | `acceptance-ri-master-proc-liveness.mjs`; journal `RI-MASTER-TRIPLE-JOURNAL.jsonl`; ephemeral PG on 8B |
| 15:02 | Accepted standalone pass | User accepted 442342 run 1 (169s) | Does **not** satisfy ×3 gate |
| 15:05 | RI master triple **442345** | Remediated gate retry | Run **1/3 PASS** (178.9s); run 2 false `child_vanished` on Phase 6 after PASS — grace fix; diag `RI-MASTER-TRIPLE-442345-DIAG.json` |
| 15:10 | RI master triple **442346** | Liveness grace (4s Windows) | **3/3 PASS** (146s / 160s / 171s); evidence `RI-MASTER-TRIPLE-442346-SUMMARY.json`; gate **CLOSED** |
| 15:19 | Staging deploy | Post ×3 gate | `dpl_Dx8d3LQjDNNgmBkjHgHTiuHFzKbb` @ `c246cfa` → `staging-app.forgeniq.com` |
| 17:18 | PS22 forensic | Staging read-only | `PS22-9-FAILED-RUNS-FORENSIC-2026-11-23.json` — both runs `stopReason: max_tokens`, spend **$0.291** |
| 17:18 | Provision-first batch plan | `extraction-batch-plan.mjs` + fail-closed grounding | `acceptance-ri-extraction-batch-plan-ps22.mjs` **PASS** (17×4-section batches) |
| 17:22 | PS22 paid request | No paid AI | `PS22-9-PAID-EXECUTION-REQUEST-2026-11-23.json` awaiting authorisation |
| 17:22 | FCA benchmark | PS26 inventory 47 (28R/19G) | `FCA-REGULATORY-BENCHMARK-2026-11-23.json`; deterministic `FCA-BINDING-ACCURACY-DETERMINISTIC-2026-11-23.json` |
| 17:22 | Staging deploy | Batch-plan + preflight | `dpl_G6K89SA1udm8BWu71jaVdQysSAyP` |
| — | SEC-DB-003 hosted | `STAGING_DATABASE_URL` still absent | Updated `SEC-DB-003-STAGING-ACCESS-2026-11-23.json` (Supabase ref `lhgzdicffkhaaykzthep`) |
| 17:28 | PS22 gate + spend | 242/242 × 17 batches | `acceptance-ri-extraction-batch-plan-ps22-gate.mjs` **PASS**; `PILOT-SPEND-RECONCILE` **$0.519483**; ceiling **$2.35** |
| 17:28 | FCA independent verify | 28R/19G instrument text | `FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json` |
| 17:30 | Git | Consolidated commit | **`f5e335a`** — batching, master runner, benchmarks, SEC-DB harness, evidence |

## 2026-11-23 — FCA reconciliation, UC-RI-005 normalize fix, PS22 prep

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 18:04 | FCA full TP/FP/FN reconcile | User P1: do not treat 28R as obligations | `FCA-PS26-ACCURACY-FULL-RECONCILIATION-2026-11-23.json` — provision ID **2/28** (7.1% recall); binding among **4** operative candidates **1/4** (25% recall); **24/28** exception/amendment/application/transitional |
| 18:04 | Root cause bundle | Missing `provisionReference`; `consultation_proposal` on final R rules; legacy benchmark n=3 | Documented in reconciliation `priorMetricMisinterpretation` |
| 18:10 | UC-RI-005 defects | Prompt + post-normalize grounding | `anthropic-prompts-core.mjs` (mandatory `provisionReference`, final PS R→`binding_requirement`); `normalize-structured-ai-output.mjs` (infer ref, remap binding on final instruments); `ai-analysis.ts` passes `isFinalisedGuidance` |
| 18:12 | Local acceptance | Normalize + PS22 gate | `acceptance-ri-normalize-obligation-output.mjs` **PASS**; `acceptance-ri-extraction-batch-plan-ps22-gate.mjs` **PASS** (242/242, 17 batches) |
| 18:12 | PS22 first-batch prep | User P2: no paid until approved | `PS22-9-FIRST-BATCH-PREP-2026-11-23.json` — batch0 preflight ok; **$0.35** above prior **$2** auth still required for **$2.35** ceiling |
| — | SEC-DB-003 hosted | `STAGING_DATABASE_URL` unset locally | Requirements unchanged; local 5/5 + staging API 6/6 only |
| — | Production | Accurate FCA + hosted DB not proven | **NO-GO** preserved; RI master **3/3** (442346) unchanged |

## 2026-11-23 — Regulatory guards, d545cad revert, Vercel CLI, staging deploy attempt

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 18:12 | Revert d545cad defect | Finalised guidance / cross-ref R must not auto-bind | `obligation-extraction-regulatory-guard.mjs`; removed consultation→binding remap; `evaluateProvisionEligibility` + unique set-out inference only |
| 18:12 | Prompt correction | Distinct instrument set-out vs guidance cross-reference | `anthropic-prompts-core.mjs` UC-RI-005 |
| 18:12 | Regression tests | Positive + negative | `acceptance-ri-normalize-obligation-output.mjs` **PASS** (4 cases) |
| 18:18 | FCA operative trace | P2: 4 cores + 7.20.1R(2) | `FCA-PS26-OPERATIVE-TRACE-2026-11-23.json` — legal operative **5/5**; legacy run ID **1/5**; extract **1/5** |
| 18:20 | Vercel CLI | P3 supported version | Upgraded to **66.6.0** |
| 18:24 | Staging deploy | `phase85h-deploy-staging-platform.mjs` | **Ready** on `staging-app.forgeniq.com`; build **`2009aec`**; evidence `STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-23.json` |
| — | PS22 gate | P4 unchanged | **242/242** **PASS**; no paid AI |
| — | SEC-DB-003 | P5 | `STAGING_DATABASE_URL` still absent |

## 2026-11-23 — Final PS22 reconcile + continuation proposal (local)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 21:57 | Final PS22 inventory | User: 65+177=242, paid 5 vs 6 | `ps22-final-reconcile.mjs` **PASS** — **6** paid POSTs, **5** succeeded, **1** failed preserved |
| 21:57 | Continuation | 14 batches, preflight 14/14 | `PS22-9-CONTINUATION-PLAN-14-BATCH`, batch-0 accuracy prep |
| 21:57 | Spend proposal | $3.25 suggested — **not authorised** | `PS22-9-CONTINUATION-PROPOSAL`; full run **$2.612** projected vs **$2.35** current |
| 21:57 | FCA taxonomy | 29 outstanding | **17** operative binding, **12** guidance; **0** live structured recall |
| — | Paid AI | Awaiting approval | No execution |

## 2026-11-23 — PS22 plan reconcile + FCA outstanding + Vercel usage (local)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 21:46 | PS22 17→18 reconcile | User P1: preserve 65, reallocate batch 5 | `PS22-9-PLAN-RECONCILE-2026-11-23.json` **PASS** — 177 remaining, **14** continuation batches, preflight **14/14**, no duplicate spend overlap |
| 21:46 | FCA 29 outstanding | Separate AI vs completeness vs human | `FCA-PS26-OUTSTANDING-RECONCILE-2026-11-23.json` — **0/29** live structured AI recall among outstanding |
| 21:50 | Vercel allowance | Usage API unavailable on Hobby CLI/MCP | `VERCEL-USAGE-RESET-2026-11-23.json` — **rolling 30d**; **no exact recovery date**; last CPU snapshot ~53m remain (prior audit) |
| — | SEC-DB-003 | No `STAGING_DATABASE_URL` | Restricted-role hosted proof still blocked; no privileged substitution |

## 2026-11-23 — Consolidated tranche (PS22 batch-5 cap, deploy 2ee3372)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 21:08 | PS22 batch-5 root cause | Run `9fd62178` AI_OUTPUT_TRUNCATED @ 8192 tokens, 22 provisions | `acceptance-ri-ps22-batch5-historical.mjs` **PASS**; fixture `ps22-batch5-run-9fd62178-forensic.json` |
| 21:09 | Provision cap gate | Prevent live oversize batches | `RI_LAB_MAX_PROVISIONS_PER_BATCH=16`; `assertBatchProvisionOutputBudget` in runtime + continue script |
| 21:10 | PS22 plan | Split former 22-provision batch | Gate **242/242**, **18 batches**, all ≤16 provisions |
| 21:15 | Build | org-scoped PDF cache JSDoc | `npm run build` **PASS** |
| 21:19 | Staging deploy | Policy: one deploy per tranche | `dpl_5Q6KNYMkCP2hLeS3FeZXCKCvkD9H` @ **`2ee3372`** → `staging-app.forgeniq.com` |
| 21:20 | Hosted UAT | No paid extract | P3 verify **PASS**; SEC-DB API **6/6**; PS22 plan on staging **18 batches**; spend **$1.282 / $2.35** |
| 21:22 | Milestone | Consolidated report | `MILESTONE-CONSOLIDATED-TRANCHE-2026-11-23.json` |

## 2026-11-23 — Provision assessment completeness (PS26 five-operative)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 18:41 | Pipeline trace | User P1: five verified operatives | `PS26-PROVISION-PIPELINE-TRACE-2026-11-23.json` + `PS26-HISTORICAL-RUNS-SNAPSHOT` |
| 18:42 | Completeness module | Batch complete ≠ regulatory accuracy | `provision-assessment-completeness.mjs`; `_forgeniqProvisionAssessments` on UC-RI-005 |
| 18:42 | Inventory | AI omission on supplied R+NEW_TEXT+duty | `ai_assessment_omission_requires_review`; `regulatoryAccuracySuccess` on reconcile |
| 18:42 | Grounding | Authoritative excerpts per batch | `provisionScopedExtraction` for all batch cores |
| 18:43 | Historical acceptance | No paid AI | `acceptance-ri-ps26-five-operative-historical` **PASS**; completeness **PASS** |
| 18:45 | Live test prep | Not authorised | `PS26-LIVE-FIVE-OPERATIVE-COST-2026-11-23.json` ~**$0.042** cap **$0.20** |
| 18:45 | FCA benchmark revised | Separate metrics | `FCA-PS26-ACCURACY-BENCHMARK-REVISED-2026-11-23.json` |

## 2026-11-23 — Consolidated deployment policy adopted

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 20:48 | Milestone-based staging deploys | Vercel CPU/storage + user mandate | `CONSOLIDATED-DEVELOPMENT-DEPLOYMENT-POLICY.md`; `.cursor/rules` updated (FORGENIQ worktree + Brieftick workspace) |
| 20:48 | Vercel resource tranche | Local gates pass | Commit pending; **no staging deploy** until next tranche UAT objective |

## 2026-11-23 — Vercel Hobby resource optimisation

| Time (UTC) | Action | Reason | Outcome |
|---|---|---|---|
| 20:35 | Resource audit | CPU 3h07/4h; 333k invocations; 8.32GB deploy storage | `VERCEL-RESOURCE-AUDIT-2026-11-23.md`; code: PDF cache, poll backoff, plan route, deploy throttle |
| 20:35 | No staging redeploy | Preserve ~53m CPU | Optimisations local until explicit deploy |

## 2026-11-23 — Approved $2.35 pilot execution

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 19:01 | Spend reconcile | User approved $2.35 ceiling | Pre-flight **$0.519** → post-pilot **$0.761** (`PILOT-SPEND-RECONCILE-2026-11-23.json`) |
| 19:01–19:02 | PS26 five-operative v1/v2 | `max_tokens` 2048/2277 | **FAILED** `038f5ae0`, `d76b60f2` (~$0.09) preserved — no retry same suffix |
| 19:02 | Output token scaling | Provision-scoped batches | `scaleMaxOutputTokensForBatch` headroom fix |
| 19:17 | PS26 five-operative **v3** | Authoritative accuracy test | **COMPLETED** `9b3bf495` **$0.060** — **5/5** `assessed_structured`, completeness **PASS** |
| 19:23 | PS22 batch 0 corrected | FCA gate passed | **COMPLETED** `063a2e9f` **$0.091**, **14/14** provisions, **0** omissions; suffix `live-ps22-corrected-batch0-2026-11-23` |
| 19:24 | PS22 batches 1–16 | Budget / per-batch gate | **Paused** — **$1.589** remaining; evidence `PILOT-EXECUTION-REPORT-2026-11-23.json` |
| 20:00 | PS22 corrected continuation | User $2.35 approval | Batches **1–4** **PASS** (0 omissions); **$1.144** cumulative; orchestration spend cap patch deployed |
| 20:10 | PS22 batch 5 | Provision omissions (e.g. **15.7.24R**) | **FAILED** `9fd62178` **$0.138** — **stopped** (no retry); 65/242 provisions supplied |

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
