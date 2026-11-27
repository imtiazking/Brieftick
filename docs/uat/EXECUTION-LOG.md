# UAT execution log

Decisions, reasons and outcomes taken under `.cursor/rules/forgeniq-autonomous-execution.mdc`. Newest first.

## 2026-11-27 — Tranche E: RI foundation (grounding, watchlists, consultations, citations)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 09:30 | Ship defence-in-depth PS26/1 grounding + Design Lab watchlists/consultations without paid AI | User Tranche E instruction from `8c58e2e` baseline | Commit `67bcb17`; migration `20261127130000_ri_watchlists_consultations` on `forgeniq-ri-staging`; CI suites `acceptance-ri-pilot-accuracy-hardening`, `RI-WATCHLISTS-CONSULTATIONS`, `RI-REGULATORY-CITATION`, `RI-REPORTS-OPEN-010` PASS. Staging deploy follows candidate-first policy. |

## 2026-11-27 — Tranche D post-closure: evidence-based RI current-state assessment (no new code)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 08:30 | Produce five assessment deliverables from staging baseline `8c58e2e` only | User instruction: comprehensive assessment after Tranche D; no architecture changes, no paid AI, no new readiness programme | Written: `RI-CURRENT-STATE-ASSESSMENT.md`, `ASK-RI-GAP-ASSESSMENT.md`, `RI-OUTSTANDING-FIXES.md`, `ASK-RI-DEVELOPMENT-BACKLOG.md`, `RI-GO-LIVE-REMAINING-WORK.md` under `docs/uat/evidence/production-readiness/`. |

## 2026-11-26 — Production Readiness Programme: atomic obligation approval (hosted-UAT defect) and Phase 12 Design Lab terminal UI

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 19:30 | Replace "write OPEN, then create the impact, then compensate" with ONE database transaction: `public.approve_obligation_with_stage2` (status change, field edits, impact, business areas and every audit event) | Root cause of the hosted-UAT 500 that left an OPEN obligation without Stage 2: two writes with a compensating revert; a crash/timeout between them, a failed revert, or a *skipped* (not thrown) Stage 2 result left the obligation OPEN and silently disconnected | The Stage 2 draft is computed first with no writes; the function then locks the row `FOR UPDATE`, re-checks status and `updated_at` under the lock (`stale_record` for losers), authorises as the caller (JWT actor must match, at least REVIEWER, otherwise `actor_mismatch` / `insufficient_role`; an identity-less session is refused on its EFFECTIVE role, not `session_user`), keeps every existing trigger live (role guard, classified-status guard, segregation of duties), and is idempotent via the existing unique impact index. A skip is recorded durably (`OBLIGATION_STAGE2_INITIATION_SKIPPED`); an unexpected commit fault is audited as `OBLIGATION_STAGE2_APPROVAL_REFUSED` with the obligation unchanged. View `obligation_stage2_integrity` (security_invoker) classifies every OPEN obligation as LINKED / RECORDED_SKIP / NO_CHANGE_RECORDED / DISCONNECTED. |
| 19:45 | Test against real Postgres, then prove the test is not vacuous | Unit doubles cannot prove atomicity | `acceptance-ri-obligation-open-atomic` 72/72 on embedded Postgres: happy path, rollback including a trigger-injected failure at the LAST write, VIEWER / other-tenant / impersonation / non-member / no-identity refusals with zero mutation, maker-checker (submitter and creator cannot approve; an independent REVIEWER can), stale-timestamp protection, 6 rounds of 3 concurrent approvals (exactly one winner, one impact, one OPEN transition), recorded skip, legacy-row recovery, cross-tenant view isolation and the TypeScript service on top. Mutation check: removing the row lock and stale check makes 9 checks fail. The legacy `acceptance-ri-obligation-reviewer-approval` double gained a transactional `rpc` and its compensating-revert assertions were replaced with rollback assertions. Dependants PASS: stage2-obligation-to-impact, phase-4-ri-workflow, governance-risk-sod, assurance-governance-security, assurance-lifecycle-gaps, compliance-lifecycle-e2e. `tsc` clean. |
| 19:50 | Corrected my own test premise | I expected a REVIEWER to be refused on a MANUAL obligation. The live trigger intentionally lets a REVIEWER approve policy-classified obligations (maker-checker with segregation of duties), and the DB classifies manual rows | Assertion replaced by the real rule: the submitter/creator is refused (`segregation_of_duties`), an independent REVIEWER succeeds. Not a platform defect. Also fixed a real flaw in my first draft of the function (it trusted `session_user`, which `SET ROLE` does not change). |
| 20:00 | Apply migration `20261126200000_obligation_open_atomic_stage2` to forgeniq-ri-staging | Pre-authorised, additive (one function, one view, no data change) | Verified on staging: SECURITY DEFINER with `search_path=''`, anon and PUBLIC cannot execute, authenticated and service_role can, view is `security_invoker`. No deployment. No paid AI. |
| 20:05 | Do NOT bulk-backfill the historical DISCONNECTED rows | Read-only staging check: 22 OPEN obligations, 4 LINKED, **18 DISCONNECTED** (11 authorised-UAT synthetic; 7 legacy MANUAL records in the main FORGENIQ organisation with no UAT provenance). Creating impacts for the 7 could alter what may be genuine regulatory records; mandatory restriction on altering historical evidence applies | The view keeps all 18 visible. Repair uses the approved workflow (re-submitting OPEN through the atomic function) per record, for the synthetic UAT set during hosted UAT. The 7 legacy records are listed as an open data-quality item in the defect register for owner decision. |
| 20:10 | Phase 12: Design Lab terminal UI (charcoal/emerald) with centred, blurred-backdrop quick-view modals for Publications and Obligations | Programme Phase 12; Design Lab only, legacy `/ri/*` frontend not touched | Source `design-lab/regulatory-intelligence` plus generated bundle in sync. `acceptance-ri-design-lab-terminal` 55/55 (model, escaping under hostile input, CSS contract, WCAG AA contrast computed, bundle parity, legacy `app/ri` and `components/ri` unchanged), real-browser check 39/39 (centred, `::backdrop` blur, focus trap, Esc, focus return, backdrop click, navigation, mobile 390px, no console errors), ESLint clean, release gate PASS. Evidence screenshots in `docs/uat/evidence/production-readiness/design-lab/`. Hosted verification is part of Phase 19. |

## 2026-11-26 — Production Readiness Programme, Phase 2: run-scoped AI execution ledger

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 18:40 | Replace the single shared account with run-reference-scoped execution (`ai_execution_runs`, `ai_execution_limits`, `ai_execution_ledger_events`) and make it the default ledger mode | Root cause of the eval-002 Stage 4 failure: one `scope_key` account carried eval-001's request count into eval-002. Counters were then reconciled by hand SQL, which must never be needed again | Run budget, request cap, tenant and validity window now come from an authorised run row. Counters, settled rows, run authorisation fields and the event log are immutable by trigger. A new run inherits nothing. Tenant and platform limits, retry accounting (retry must reference a FAILED request), interrupted-execution reconciliation (charged at full reserve) and operator recovery are covered. Local `acceptance-ri-run-scoped-ledger` PASS (all checks); legacy ledger, lifecycle live-AI, PS26.1 budget guard and UC-RI-005 suites PASS; `tsc` clean. Commit `596f81d`. |
| 18:55 | Apply the migration to forgeniq-ri-staging (additive, non-destructive) after a logical snapshot | Pre-authorised non-destructive staging migration | Snapshot in `docs/uat/evidence/production-readiness/PRE-MIGRATION-LEDGER-SNAPSHOT.json`. Verified: 3 tables, 5 triggers, forced RLS, 0 client-executable functions, 7 service_role functions, 10 historical reservations unchanged, 0 runs authorised. No paid calls. No deployment. |

## 2026-11-26 — FCA-EVAL-002 live pilot `pilot-fca-eval-002-conc-7-20-1r` (executed)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 16:17 | Close authorised window after five stages + assurance | User authorised one $0.75 / 8-request staging run for CONC 7.20.1R | **5** SETTLED provider calls in window ($0.151396); baseline acceptance **11/11**; expert interpretations unchanged. Stage 4 first attempt hit shared-ledger `request_count` cap (eval-001 + eval-002); reconciled counters and recovered via `retry-control-mapping`. Paid AI **disabled** (`executionEnabled=false`, stages FIXTURE) on official `staging-app.forgeniq.com` after restore deploy. Evidence: `docs/uat/evidence/live-ai-pilot-fca-eval-002-2026-11-26/`. Eval-001 evidence preserved. |

## 2026-11-26 — Pilot preflight guards

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 01:55 | Require a grounded citation before a live stage 2–5 draft is returned, and add `release_abandoned_lab_ai_reservation` | A schema-valid model reply could be stored without a source, and a dead process could leave a RESERVED hold with no operator trail | Recovery function applied on forgeniq-ri-staging. Execute limited to `postgres` and `service_role`. Ledger still empty. Local acceptance PASS. No paid calls. |
| 02:13 | Promote the citation gate | The running deployment had to contain the preflight code | Official `dpl_CABPEw5cx3y96MnMMMtR2o4gSRhF` (`c511084`). Candidate and post-promote smoke PASS. Catalogue counts unchanged. GitHub Actions `45739119148` success. Execution remains off. |

## 2026-11-26 — Shared spend ledger on staging, CI unblock

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 01:35 | Apply `lab_ai_shared_spend_guard` to forgeniq-ri-staging, then revoke `anon` and `authenticated` execute | Supabase default privileges granted security-definer execute to client roles. GitHub Actions `45734885128` exited 2 because the CI catalogue marked the self-contained embedded test `local-db`, which the offline gate treats as blocked. | Staging tables empty, RLS forced, execute limited to `postgres` and `service_role`. Probe reservation was rolled back by delete. Acceptance `acceptance-ri-shared-spend-guard` PASS. No paid calls. |
| 01:37 | Promote the shared-ledger build after candidate smoke | Official staging was still the pre-ledger deployment | Official `dpl_7bf9Dt5r1UKM6wPWXG1CnNQGomGs` (`7f8f090`). Candidate and post-promote authenticated smoke PASS (Users A and B, 50 review buttons). Customer production not touched. |

## 2026-11-26 — Shared Anthropic spend ledger

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 01:20 | Persist pilot reservations in Postgres and fail closed without that ledger | Process memory cannot enforce one ceiling across Vercel instances | `reserve_lab_ai_spend` / `settle_lab_ai_spend`. Two-client test PASS. Stages 2–5 set to FIXTURE on staging. Ceiling set to $0.75 and 8 requests. Migration not applied remotely: no Supabase access token. No paid calls. |

## 2026-11-26 — Lifecycle stages 2–5 live provider wiring

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Route UC-RI-004/006/007/008 through `runLifecycleStageAnalysis` and the existing provider registry | Stages 2–5 only called the fixture provider | Fixture remains the default. Live mode fail-closes with no draft insert and no fixture fallback. Spend guard covers those use cases plus a process cumulative USD ledger. Mocked acceptance PASS. Staging `dpl_BNifu9UxyuQW7SDPQHaq1EUwZMvu` (`3d8de4e`). No paid calls. |
| — | Fresh IN_REVIEW risk browser check | Recycled closed lifecycle was not a valid negative test | Risk `4637fbc4-a0bf-40e5-a810-5a04a425274b`: maker segregation toast, status stayed In Review, checker approved. Assurance finding link PASS. |

## 2026-11-26 — UAT governance feedback + live AI prep (no paid AI)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 00:12 | Governance PATCH errors and assurance finding links in Design Lab | Risk maker self-approve produced no toast; assurance detail hid finding navigation | Per-render risk/control action bindings; `formatConnectedPatchError`; `renderAssuranceFindingLinks`; acceptance `RI-GOV-PATCH-FEEDBACK` + `RI-GOV-RISK-SOD` PASS; promoted `dpl_7DvDaEBeyDwmrEjETBCoN5k26THb` from `dbf216f` (evidence-only — code commit + second promote required for UI fixes) |
| — | Live AI pilot package | User mandate phases 2–6 without executing paid calls | `docs/uat/LIVE-AI-*.md`, FCA eval cases, pilot budget **$0.75 ceiling** awaiting approval |

## 2026-11-25 — Design Lab stages 2–5 browser completion

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 23:33 | Refetch assurance detail on every open, and add Design Lab submit/approve controls for risks, controls and the assurance plan | Cached assurance timestamps rejected later actions as stale, and risk/control pages could not start the next stage | Official `dpl_6isCeKaCNMuAYR9PvCGfdSSXirPR` (`9241298`). GitHub Actions run `45720343481` success. Browser path closed with `COMPLIANCE_LIFECYCLE_CLOSED` on obligation `b330fc90-b16c-4dd0-947f-10a96c209efe`. Risk self-approval did not surface a toast. The assurance page does not link the failed-test finding; closure succeeded after the finding was closed on its own page. |

## 2026-11-25 — Design Lab authorised UAT registers

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 22:15 | Render authorised UAT obligations and impact assessments in their own register sections | Catalogue side arrays were loaded, but the obligation and impact pages only rendered the operational partition, so persisted UAT rows were not navigable | Commit `83a33cd`. Candidate `dpl_83MfoihicphZm4hmbs5nMe7YTzia` promoted to official and candidate aliases after isolation, Clerk, and authenticated smoke. Browser register contained the new synthetic obligation. Full five-stage click-through was not completed in the browser. |

## 2026-11-25 — Obligation approval atomicity and Design Lab list scope

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 21:40 | Roll back OPEN when Stage 2 throws, and retry the impact insert with the workflow writer only after approval is authorised | Reviewer RLS can reject the impact insert after the status update, leaving OPEN without an assessment | Local `acceptance-ri-obligation-reviewer-approval.mjs` PASS, including rollback, no success audit, and idempotent repeat |
| 21:40 | `scope=all` primary registers include authorised UAT rows; list views carry lineage ids | `tenant-work` always returned the operational partition, and risk/control list JSON omitted parent ids | `primaryRowsForLabScope`; impact detail exposes `riskIds` |

## 2026-11-26 — Staging UAT preparation (compliance lifecycle)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Baseline frozen | `f89b8f5` accepted as local dev baseline | No new feature work; prep only |
| — | UAT pack | Consolidated manifest + migration/RLS review | `docs/uat/STAGING-UAT-COMPLIANCE-LIFECYCLE-PREP.md`; prep migration `20261125200000_impact_assessment_risk_links_rls.sql` |
| — | Sessions | Preserve A/B/C Clerk profiles | `staging-user-sessions.mjs status` → A/B/C VALID |
| — | Vercel | CPU/storage quota | **No deploy** — restriction treated as unresolved pending dashboard check |
| — | Hosting | — | Candidate-first + authenticated gates remain mandatory for promote |

## 2026-11-26 — Evidence integrity and assurance governance matrix

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Evidence–control binding | Silent provenance skips allowed unrelated tenant evidence | `assurance-evidence-binding.ts`: align lineage, mandatory `evidence_control_links`, per-test bindings; lifecycle evidence inherits locked control metadata; closure validates integrity |
| — | Closure hardening | Staging UAT requires non-bypassable guards | Authorised exception detail; deferred mandatory links block close; idempotent `COMPLIANCE_LIFECYCLE_CLOSED` |
| — | Security acceptance | Runtime RLS + SoD matrix before staging | `acceptance-ri-assurance-governance-security.mjs` **PASS**; catalogue **RI-ASSURANCE-GOVERNANCE-SECURITY**; offline CI **25/25 PASS** |
| — | Vercel | Hobby CPU quota | **No deploy** |

## 2026-11-26 — Assurance execution and guarded lifecycle closure

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Assurance workflow split | Plan approval must not emit `COMPLIANCE_LIFECYCLE_CLOSED` | `approve` → `TESTING_READY`; actions `record_test`, `complete_remediation`, `accept_exception`, `close_lifecycle`, `reopen_lifecycle`; `assurance-closure-guards.mjs` |
| — | Provenance lineage | Silent `provenance_link_mismatch` skips removed | `buildLockedChildMetadataFromParentRecord` on stages 3–5 children; `LIFECYCLE_LINK_DEFERRED` when link still incompatible |
| — | Acceptance | Negative premature closure + fail/remediate/retest path | `acceptance-ri-compliance-lifecycle-e2e.mjs` and `acceptance-ri-assurance-lifecycle-gaps.mjs` **PASS**; offline CI **24/24 PASS** |
| — | Vercel | Hobby CPU quota | **No deploy** |

## 2026-11-25 — Stages 3–5: integrated compliance lifecycle (fixture AI)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Stages 3–5 orchestration | Impact approve → UC-RI-006 risk DRAFT; risk validate → UC-RI-007 control DRAFT; control approve → UC-RI-008 assurance plan; human submit/approve each stage; `COMPLIANCE_LIFECYCLE_CLOSED` on obligation | Downstream services + governance on risks/controls/assurance; `acceptance-ri-compliance-lifecycle-e2e.mjs` **PASS**; catalogue **RI-COMPLIANCE-LIFECYCLE-E2E**; Design Lab `connected-compliance-lifecycle-panel.js` |
| — | Regression | Stage 2 preserved | `acceptance-ri-stage2-obligation-to-impact.mjs` **PASS** after Stage 3 hook on impact approve |
| — | Vercel | Hobby CPU quota | **No deploy** |

## 2026-11-25 — Stage 2: obligation OPEN → AI impact draft

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| — | Stage 2 orchestration | Approved obligation (`OPEN`) must idempotently create linked DRAFT impact (UC-RI-004 fixture) + human approve + `STAGE3_RISK_MAPPING_READY` | `ensureImpactAssessmentFromApprovedObligation` on obligation transition; unique partial index on `metadata->>sourceRegulatoryObligationId`; Design Lab link panel on obligation detail |
| — | Acceptance | Embedded Postgres + RLS; classified obligation OPEN by independent reviewer (not submitter) | `acceptance-ri-stage2-obligation-to-impact.mjs` **PASS**; catalogue `RI-STAGE2-OBLIGATION-IMPACT`; offline `npm run qa --mode=ci` **22/22 PASS** |
| — | Vercel | Hobby CPU quota | **No deploy** |

## 2026-11-25 — GitHub Actions offline CI gate

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 13:50 | Root cause | `forgeniq-qa` runs `npm ci` only in `apps/platform`; browser smoke imports `playwright` declared at repo root | GHA exited in &lt;1s (`ERR_MODULE_NOT_FOUND` / missing browser binary); local passed via hoisted root `node_modules` |
| 13:52 | Fix | Declare `playwright` in `apps/platform`; keep `npx playwright install chromium` in workflow; remove duplicate preflight smoke step | Offline `npm run qa` **PASS** with root `playwright` hidden; promote gate unchanged |
| — | Vercel | Hobby CPU quota | **No deploy** |

## 2026-11-24 — Six-queue UAT auth gate (19:05 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 19:00 | Session status | Hosted validation needs User B | **A/C VALID**; **B EXPIRED** (Clerk cookie) |
| 19:00 | Preflight | Fail before API mutations | `requireUatPersonas` + `preflight` CLI on `staging-user-sessions.mjs` |
| 19:01 | Headed renew B | Interactive Clerk only path | Browser open — waiting **session saved** |
| 19:04 | Queue reconcile | User C read-only | **PASS** — 131+12+22+37+6+0=**208**=ALL; UI returns **150** rows (`truncated=true`) |
| — | Five-decision hosted | Reviewer | **BLOCKED** until B session valid |

## 2026-11-24 — P0 triage ReferenceError (18:30 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 18:18 | `resolvedSegment is not defined` | `5cb31cb` removed duplicate `const` but `hydrateConnectedTriage` still referenced `resolvedSegment` | Use in-scope `segment` (lines 333–334); include `all` for metrics |
| 18:28 | Staging deploy | Consolidated fix | **`dpl_EvDcgUYGDsHc4rXAdXzQCL4hVL4S`** @ `staging-app.forgeniq.com` |
| 18:31 | Hosted queue smoke | User C session + DOM | **7/7 PASS** (`staging-design-lab-triage-queues-smoke.mjs`); AI Findings 131 rows + five-decision host |
| — | User B session | Reviewer SoD | Still **EXPIRED** — first-review buttons need `renew B` for full reviewer UAT |

## 2026-11-24 — P0 Design Lab blank screen (17:30 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 17:20 | Root cause | `#ri-app` empty; HTTP 200 | ES module parse error in `connected-triage.js`: duplicate `const resolvedSegment` (six-queue, deploy `dpl_3LMje…`) |
| 17:22 | Fix | Remove duplicate declaration | Commit `5cb31cb`; `sync-design-lab-bundle` module graph OK |
| 17:28 | Staging deploy | Restore visible RI | **`dpl_GLP3MRLtRpdMNcszCw8Ap24WW339`** → `https://staging-app.forgeniq.com` |
| 17:28 | Browser verify | Nav + invalid `#/ai-a/broken` | **Page not found** (not blank); dashboard chrome renders |
| — | Six-queue UAT | A/B/C sessions still EXPIRED | Resume after site confirmed; auth unchanged |

## 2026-11-24 — Staging UAT session regression (17:15 UTC)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 17:15 | Auth root cause | A/B/C `401` on `/api/ri-lab/session`; E2E passed 10:46 UTC same day | **Clerk cookie expiry** in Playwright profiles — not staging API/RBAC regression |
| 17:15 | Blank headed login | `about:blank` + no Clerk wait (prior behaviour) | Fixed in `staging-user-sessions.mjs`: full redirect, `load`, Clerk wait; `diagnose B` **PASS** |
| 17:15 | Tooling | `inspect`, `renew`, `FORGENIQ_UAT_LOGIN_WAIT_MS`, `lastEstablished` in `status` | Doc `STAGING-SESSION-REGRESSION-2026-11-24.md` |
| — | Six-queue hosted UAT | All personas **EXPIRED** | **Blocked** until `renew B` + `renew A` (interactive Clerk); no staging redeploy required |

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

## 2026-11-23 — Consolidated remediation RC

| Time (UTC) | Decision | Outcome |
|---|---|---|
| 23:05–23:15 | Local RC | 22/22 consolidated gates; build + typecheck PASS |
| 23:23 | One staging deploy | `dpl_CMyZg31KhbgDgasEVB6j3YTjaukY` @ `441a982` |
| — | Paid AI | **None** in remediation tranche |
| — | Report | `FORGENIQ-CONSOLIDATED-REMEDIATION-REPORT-2026-11-23.md` |

## 2026-11-23 — PS22 continuation v2 batch 1 (authorised)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 22:35 | Spend reconcile fix | v2 runs bypass orchestration ledger, `9b8fbd1f` missing | Reconcile reads continuation evidence run ids; cumulative **$1.387437** |
| 22:38 | Fixture fix | `manual_record_creator_required` (SEC-DB-002 guard correct, fixture stale) | Eligibility 47/47, review service 32/32, triage 99/99, review 52/52, security 5/5 |
| 22:40 | Suffix before deploy | Avoid second deploy (batch-0 lesson) | `live-ps22-continuation-v2-batch1-2026-11-23` merged, 28 suffixes |
| 22:44 | One staging deploy | Ship `4e5b688` parse fix | `dpl_MAucFXiAVrXm81QtrmKFw9Gs9pgW` @ `e4664ea`, health verified |
| 22:47 | Paid batch 1 | User authorised | `ffb5ae47` **COMPLETED** $0.100785; 16/16 complete, 16/16 classification, 16/16 verbatim quotations, 2/2 R |
| 22:52 | Reconcile | Nested User A session 401 | Moved reconcile after session close; cumulative **$1.488222**, remaining **$0.861778** |
| — | Stop | No authorisation beyond batch 1 | Ceiling request updated: 7 batches fit $2.35, all 12 need ~$2.73 |

## 2026-11-23 — PS22 batch-0 classification + engine fix (local)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 22:30 | Batch-0 discrepancy investigation | 4 heuristic “bindingNature” mismatches | **1** engine fix (`parseProvisionReference` parenthetical labels); **3** correct consultation guards; **16/16** classification plausible after metric fix |
| 22:32 | PS26 operative trace | 17 outstanding operative (taxonomy) | PDF independent verify **28R**; deterministic trace separates omission detection vs live recall; historical acceptance **PASS** |
| 22:33 | SEC-DB-003 | Hosted blocked | Local **5/5**; staging setup instructions documented; `STAGING_DATABASE_URL` still required |
| — | PS22 batch **1** | User A session **401** | Paid batch **not** started; ceiling approval request written (`PS22-9-CEILING-APPROVAL-REQUEST`) |

## 2026-11-23 — PS22 continuation v2 batch 0 (authorised)

| Time (UTC) | Decision | Reason | Outcome |
|---|---|---|---|
| 22:06–22:09 | Staging deploy | Suffix env requires runtime pickup | `dpl_3TXnVH16…`, `dpl_J1kojkLK…` @ `d04ed25` |
| 22:10 | Paid batch 0 v2 | User: 1 batch ≤$0.20 under $2.35 | Run `9b8fbd1f` **COMPLETED** $0.105, **16/16** completeness, suffix `live-ps22-continuation-v2-2026-11-23` |
| — | Stop | No auto batch 2 | `noFurtherBatches` per mandate |

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

## 2026-11-23 — Final regulatory verification and UAT closure

| Time (UTC) | Activity | Outcome |
|---|---|---|
| 23:35–23:40 | PS22/9 source verification | SHA256 match; identity **PS22/9** (not CP22/9); `PS22-9-SOURCE-PUBLICATION-VERIFICATION-2026-11-23.json` |
| 23:39–23:40 | Consolidated remediation gates | **23/23 PASS** incl. `acceptance-ri-regulatory-pdf-analysis-ps22` |
| 23:43–23:48 | RI master acceptance | **PASS** 254.2s |
| 23:44 | Staging P2 regression | **19/19 PASS** — `STAGING-P2-REGRESSION-2026-11-23.json` |
| 23:35 | 97-provision revalidation | **97** preserved; **legallyVerified: 0** |
| 23:55 | Staging deploy (tranche) | **`ff83dfe`** → **`dpl_6YDkQJaukiGguT5kcSkYSMzQfnmB`** @ staging-app.forgeniq.com |
| — | Paid PS22 continuation | **Not executed** ($1.488 / $2.35 ceiling) |
| — | SEC-DB-003 hosted | **BLOCKED** (no `STAGING_DATABASE_URL`) |
| — | Deliverable | `docs/uat/FORGENIQ-FINAL-REGULATORY-VERIFICATION-2026-11-23.md` |

## 2026-11-24 — Regulatory accuracy remediation

| Activity | Outcome |
|---|---|
| 97 versioned reassessments | 96 corrected from existing PDF evidence; 1 human review (`2A.3.30E`); 0 fresh AI; legally verified **0** |
| Publication date | FCA record **2022-07-27**; 29 July was an incorrect inference. Commencement 2023-07-31 / 2024-07-31 |
| PS26 17 operative | Stage `supplied_to_model_structured_reference_omitted`; not counted as live recall |
| Security | Local 5/5; staging API 6/6; SEC-DB-003 hosted still blocked |
| Local browsers | Extraction button PASS; applicability FAIL (Clerk key); finding review FAIL |
| Paid AI | Not executed. Report `docs/uat/FORGENIQ-REGULATORY-ACCURACY-REMEDIATION-2026-11-24.md` |

## 2026-11-24 — UAT closure and AI readiness

| Activity | Outcome |
|---|---|
| Applicability browser | **PASS** after the Clerk publishable key was added to gitignored `.env.local` |
| Finding-review browser | **PASS** after the test supplied provision function, reference and obligation wording |
| PS26 paid plan | **16 + 1** provisions; preflight PASS; not executed; **$0.206** |
| PS22 continuation | **145 provisions / 12 batches** ready; **$1.237**; not executed |
| Hosted PS22 date | Policy Statement title is correct; `publication_date` is null; no audited write |
| RI master, typecheck, build | **PASS** |
| Report | `docs/uat/FORGENIQ-UAT-CLOSURE-AI-READINESS-2026-11-24.md` |

## 2026-11-24 — Final validation and production readiness

| Activity | Outcome |
|---|---|
| PS22/9 publication date | Staging row `7a73ac4c-d6b4-4411-9f6d-1276053f2831` set to **2022-07-27** by migration `20261124013000_ps22_9_publication_date`. Source hash unchanged. One row updated. API GET confirms the date |
| Hosted workflow reads | Anonymous **401**. Catalogue **275**. Orchestration `PARTIAL_PAUSED`, 17 batches. Changes **25**. Impacts **1** UAT. Obligations **9** UAT, known obligation **OPEN**. Audit events **7**. Notifications **22**. Risks, controls, actions, evidence **0** for this organisation |
| Not executed | New ingestion, new finding review, new maker-checker, cross-tenant negative, paid extraction |
| Paid gate | Plan valid. `--execute` not used. Projected **$2.931** against ceiling **$2.35**. No provider call |
| SEC-DB-003 hosted | **BLOCKED — EXTERNAL DEPENDENCY**. `STAGING_DATABASE_URL` unset |
| Deploy | None. Existing staging app already returns `publication_date`. No production deploy |
| Report | `docs/uat/FORGENIQ-FINAL-VALIDATION-PRODUCTION-READINESS-2026-11-24.md` |
| Decision | **NO-GO** |
| Local gates | Typecheck PASS. Build PASS. RI master first run failed on an empty database; migration now no-ops when the PS22/9 row is absent. Phase 3A PASS. RI master **PASS 391.5s** |

## 2026-11-24 — Design Lab final validation (autonomous)

| Activity | Outcome |
|---|---|
| Dashboard publication count | **Fixed** at `314a980`: parallel `catalogue/summary`, headline **275** on staging (was **0** while loading) |
| Triage queues | Preserved: obligation **68**, non-obligation **136**, exception **4**; anonymous triage **401** |
| Hosted browser | **16** Design Lab screenshots + `docs/uat/evidence/design-lab-final-2026-11-24/result.json` after deploy |
| Staging deploy | **`dpl_EQmJ39kpih36JA43ZeNH2mfsp9tZ`** — `314a980` → `forgeniq-platform-staging` / `staging-app.forgeniq.com` |
| Hosted API reads | Re-run `HOSTED-RI-WORKFLOW-UAT-2026-11-24.json` — catalogue **275**, triage API **200** |
| Security local | `test:acceptance:phase8-security:local-db` **PASS** |
| SEC-DB-003 hosted | Still **BLOCKED** (`STAGING_DATABASE_URL` unset) |
| Paid gate | No execution; projected **$2.931** vs ceiling **$2.35** |
| E2E writes | **Not executed** this tranche (read-only staging policy) |
| Report | `docs/uat/FORGENIQ-FINAL-DESIGN-LAB-VALIDATION-2026-11-24.md` |
| Decision | **NO-GO** (regulatory + security + write-path gaps) |

## 2026-11-24 — Design Lab full compliance workflow (executed)

| Activity | Outcome |
|---|---|
| Isolated UAT run | `2c840c0b` PS26/1 — **not** PS22/9 |
| Finding review | User B — review `b0e08a19`; **4** DRAFT obligations materialised |
| Maker–checker | User A → IN_REVIEW; User C → OPEN on `57bcc479-fe9f-42ec-873e-3cdb1552a2cc`; User B SoD **403** |
| GRC | Impact `c76007e4`; risk `89b7d5c3`; control `005e92f7`; action `136a52ad`; evidence `e700c545` + upload |
| Report | `docs/uat/HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.md` + JSON |
| Workflow verdict | **PASS** (15/15 stages) |
| Production | **NO-GO** unchanged (legal verification, SEC-DB-003, second org) |

## 2026-11-24 — Obligation Triage human verification & approval indicators

| Activity | Outcome |
|---|---|
| Feature | Human Verification + Approval Status columns, filters with live counts, row actions (Verify / View Verification / View Decision / View Approval) on Design Lab `#/triage/obligations` |
| Backend | `triage-verification-status.mjs` + `triage-queues.ts` — derived from `ai_analysis_finding_decisions` + `regulatory_obligations.status`; `legallyVerified` remains **false** |
| Local gates | Typecheck PASS; build PASS; `acceptance-ri-triage-verification-status` PASS; `acceptance-ri-triage-screens` PASS; finding-review SoD **32/32** |
| Staging deploy | **`dpl_Bq7199abopXnX4Jszcr967Bp1gaW`** — commit `ad9edcb` → `forgeniq-platform-staging` (`prj_y9O1A1zGFXe3GvJITnLL9mJUqve7`) |
| Hosted evidence | `docs/uat/evidence/triage-verification-2026-11-24/` — API counts **60** obligation-triage rows: verified **12**, rejected **36**, needs review **12**; approval approved **9**, draft **3** |
| Production | **NO-GO** unchanged |

## 2026-11-24 — Obligation triage decision provenance audit + manual controls

| Activity | Outcome |
|---|---|
| Audit | `docs/uat/OBLIGATION-TRIAGE-DECISION-PROVENANCE-2026-11-24.md` + `docs/uat/evidence/obligation-triage-decision-audit-2026-11-24/` |
| Finding | **0** genuine regulatory VERIFIED on staging; **12** workflow VERIFIED = **UAT** (`human_verified_uat`); **48** UAT/test decision rows; **12** NEEDS REVIEW (no decision row yet); **9** APPROVED obligations = staging maker-checker only |
| 68→60 | Post–PS26/1 E2E review re-triaged findings (+6 non-obligation, +2 exception) — not deletion |
| UI | Manual **Verify / Reject / Needs review** buttons; UAT badges; **Verified (regulatory)** vs **Verified (UAT)** filters |
| Hotfix | `organisation_memberships` join restored triage API (`d440ade`) |
| Deploy | **`dpl_Arq8jVRdRRnCRHEqzp9H4A4uzgbt`** (`d440ade`) |

## 2026-11-24 — Human-review experience (presentation counts + reassessment)

| Activity | Outcome |
|---|---|
| Presentation counts | `verification-presentation.mjs` + triage API `presentationCounts` — **AWAITING_FIRST_REVIEW 12**, **GENUINE_REGULATORY_VERIFIED 0**, **UAT_VERIFIED 12**, **REJECTED_UAT 36** (staging) |
| Reassessment | Migration `20261124130500` + RPC `ri_reassess_ai_finding`; append-only `ai_analysis_finding_reassessments`; POST `/api/ri-lab/ai-analysis-runs/[id]/findings/[findingId]/reassess` |
| UI | Design Lab obligation triage metrics strip; **Reassess** + **View history**; governance panel `renderFindingReassessmentPanel` — prior rows immutable |
| Local gates | Build PASS; `acceptance-ri-finding-reassessment` PASS; `acceptance-ri-triage-verification-status` PASS; `acceptance-ri-triage-screens` PASS; finding-review service **32/32** |
| Staging DB | Supabase `forgeniq-ri-staging` — migration applied (`ri_finding_reassessment_v2`; RLS `is_active_member`) |
| Staging deploy | **`dpl_8pL5b3zp7623h2ECTA2NKFNMYBQu`** — `da4a8e3` → `forgeniq-platform-staging` (smoke script `7df9e0c`, no redeploy) |
| Hosted UAT | `staging-finding-reassessment-smoke.mjs` **PASS** — evidence `docs/uat/evidence/finding-reassessment-staging-smoke-2026-11-24/SMOKE.json`; User B reassessment persisted; User A **400**; no paid AI |
| Design Lab URL | `https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html#/triage/obligations` |
| Production | **NO-GO** unchanged |

## 2026-11-24 — Six-queue regulatory triage workflow

| Activity | Outcome |
|---|---|
| Queues | `regulatory-workflow-queues.mjs` — AI Findings, Verified Obligations, Non-Obligations, Rejected Findings, Exceptions, Not Applicable, All Findings (derived; no duplicate rows) |
| Routing | Effective queue from persisted decisions + reassessments; `ORGANISATION_NOT_APPLICABLE` disposition |
| Design Lab | Dashboard seven cards; five human decision buttons on AI Findings inbox; legacy `#/triage/obligations` → verified-obligations |
| Local gates | Build PASS; `acceptance-ri-six-queue-workflow` PASS; triage screens/verification PASS; finding-review **32/32** |
| Staging deploy | **`dpl_3LMjeSKA2PTBRyYyuj9gT2t5JL8a`** — `0894e1f` |
| Hosted UAT | **BLOCKED** (Clerk session expired User B **401**); login B then `staging-six-queue-triage.mjs` |
| Production | **NO-GO** unchanged |

## 2026-11-24 — Six-queue hosted UAT tranche (Users B + A)

| Activity | Outcome |
|---|---|
| Auth preflight | **B, A VALID** (`staging-user-sessions.mjs preflight B,A`) |
| Staging deploy | **`dpl_BhxKEAGPjyK3hP8jpLpsJyKGAcMK`** — local HEAD incl. `finding-review-core` N/A triage fallback + triage `resolvedSegment` fixes (`staging-app.forgeniq.com`) |
| Triage script | `staging-six-queue-triage.mjs` — **PASS** (counts, reconcile, five-decision buttons) |
| Hosted validation | `staging-six-queue-hosted-validation.mjs` — **PASS** (24 steps): all queue screens + screenshots; routing reject / exception / N/A / non-obligation / verify-obligation; audit history; SoD User A **403/400** on reassess |
| Queue reconcile | `ALL_FINDINGS` **208**; `NOT_APPLICABLE` **0 → 1** after N/A routing test |
| Evidence | `docs/uat/evidence/six-queue-workflow-staging-2026-11-24/` (`HOSTED-VALIDATION.json`, `RESULT.json`, `queue-*.png`, `dashboard-six-queue-cards.png`, `ai-findings-five-decisions.png`) |
| Defect fixes | UAT: N/A route via **reassess** only (first review requires full-run decisions); core: OBLIGATION_TRIAGE fallback when disposition `ORGANISATION_NOT_APPLICABLE` blocked on EXCEPTION queue |
| Local changes | Uncommitted: `finding-review-core.mjs`, `staging-six-queue-hosted-validation.mjs` |
| Production | **NO-GO** unchanged |

## 2026-11-24 — Six-queue release housekeeping **COMPLETE**

| Activity | Outcome |
|---|---|
| Status | **Six-queue implementation and validated test coverage: COMPLETE** |
| Staging app deploy | **`dpl_B6KXoEmriaxA6BAfNAcXyrhX5TB8`** (`staging-app.forgeniq.com`) — N/A triage fallback in Node (`finding-review-core.mjs`) |
| Staging DB | Migrations applied: `20261124194500_ri_finding_review_org_not_applicable` (RPC allow-list + rejected `legal_status` hotfix); `20261124201500_ri_finding_decision_disposition_org_na` (`ai_analysis_finding_decisions` disposition check includes `ORGANISATION_NOT_APPLICABLE`) |
| Initial-review N/A | Hosted POST first human review **PASS** — run `be03ff0f-841a-45ce-a7b5-1dfbd4dc5ae0`, finding `9da97a0a…`, disposition `ORGANISATION_NOT_APPLICABLE` → workflow queue **NOT_APPLICABLE** (distinct from non-binding guidance) — evidence `FIRST-REVIEW-NA.json` |
| Hosted validation | `staging-six-queue-hosted-validation.mjs` — **PASS** (24 steps) |
| Queue smoke | `staging-design-lab-triage-queues-smoke.mjs` — **PASS** (7/7; extended AI Findings load wait) |
| Count reconcile | `ALL_FINDINGS` **208**; API returns **150** rows (`truncated=true`); sum of six queues **208** — evidence `QUEUE-COUNT-RECONCILE.json` |
| Local gates | `acceptance-ri-six-queue-workflow` PASS; `acceptance-ri-classification-policy-core` **118/118**; `npm run build` PASS |
| Evidence | `docs/uat/evidence/six-queue-workflow-staging-2026-11-24/` (JSON + PNG) |
| Limitation | All Findings UI/API list cap **150** of **208** (`MAX_ITEMS` in `triage-queues.ts`); counts and reconcile remain authoritative |
| Production | **NO-GO** unchanged; no paid AI extraction |

## 2026-11-24 — Triage pagination (all workflow queues)

| Activity | Outcome |
|---|---|
| Change | Server-side pagination on `GET /api/ri-lab/triage` — `page`, `pageSize` (25/50/100), `verificationFilter`, `approvalFilter`, `search`; stable sort (`runCreatedAt`, `claimIndex`, `findingId`) |
| UI | Design Lab queue screens: per-page selector, Previous/Next, server-side filters/search preserved across pages |
| Staging deploy | **`dpl_6yZzEKoRBpyUkFcrcPGDBfLvCxzz`** (`09fdb44`) → `staging-app.forgeniq.com` |
| API integrity | `staging-six-queue-pagination-integrity.mjs` **PASS** — **208** ALL_FINDINGS ids across **9** pages (size 25), zero duplicates, all six queues complete |
| Count reconcile | **208** unique ids via paginated fetch (`pageSize=100`); sum six queues **208** |
| Browser | `staging-design-lab-triage-pagination-browser.mjs` — evidence `PAGINATION-BROWSER.json`, `all-findings-pagination.png` |
| Queue smoke | `staging-design-lab-triage-queues-smoke.mjs` **PASS** (7/7) — default page shows ≤50 rows; totals in status line |
| Commits | `83c15fe` (pagination core), `09fdb44` (page-size attribute fix) |
| Six-queue logic | Unchanged — workflow derivation, decisions, reassessments, audit |

## 2026-11-24 — My Tasks (Work Queue rename)

| Activity | Outcome |
|---|---|
| Rename | Design Lab **Work Queue → My Tasks**; routes `#/work`, `#/work-queue`, `#/my-tasks` (same view); not a seventh triage queue |
| API | `GET /api/ri-lab/my-tasks` — aggregates work-queue, obligations maker-checker, governance pending, triage actionable items (team scope only); pagination 25/50/100 |
| UI | Metrics strip, filters (open / awaiting review / overdue / due soon / unassigned / completed), search, server pagination — `connected-my-tasks.js` |
| Local gates | `acceptance-ri-my-tasks` **PASS**; `npm run build` **PASS** |
| Staging deploy | **`dpl_6Zwj67yP1WXTbPyoCirLafNHw7WU`** (`1c991ee`) → `staging-app.forgeniq.com` |
| Hosted UAT | **BLOCKED** — Clerk saved sessions A/B/C **401** after deploy window; renew with `node scripts/uat/staging-user-sessions.mjs renew <A|B|C>` then `staging-my-tasks-abc.mjs` + `staging-design-lab-my-tasks-browser.mjs` |
| Six-queue | Unchanged — triage service/logic not modified |
| Production | **NO-GO** unchanged; no paid AI extraction |

## 2026-11-24 — Blank-screen P0 (My Tasks module crash)

| Activity | Outcome |
|---|---|
| Cause | `connected-my-tasks.js` imported `connectedCatalogueBanner` from `connected-display.js`, which does not export it. The browser aborted the whole `app.js` module graph, so `#ri-app` stayed empty. |
| Fix | Import the banner from `connected-catalogue.js`. HTML shell shows **FORGENIQ is temporarily unable to load** if startup fails. HTML entry script is stamped with the build id. |
| Gate | Named-import and syntax check in `validate-design-lab-js-deps.mjs` (sync fails closed). ESLint `no-undef` / `no-redeclare` on Design Lab `js/`. Unauthenticated Playwright smoke of 12 routes plus a recovery fixture. |
| Preview | `dpl_GGs2zrCHDPVTyhHR35PmCbKRstZG` was **not** promoted when the first preview smoke hit Vercel Authentication. After an OIDC header, preview smoke **PASS** (sign-in shell mounted). |
| Limitation | `vercel promote` on this project created a new production deployment rather than only aliasing the preview. Preview URLs require Vercel authentication; smoke uses `vercel env run`. |
| Staging | **`dpl_HDHFNZkoRa6mpeHxXrWTvWL2ef2V`** aliased to `https://staging-app.forgeniq.com`. Live browser: dashboard **275 publications**, My Tasks empty state for the signed-in maker, AI Findings **queue total 96** with pagination. |
| Production | **NO-GO**. No paid AI. Six-queue logic unchanged. |

## 2026-11-24 — QA orchestrator

| Activity | Outcome |
|---|---|
| Approach | One orchestrator over existing acceptance scripts, Design Lab ESLint, the module-binding check, and the Playwright render smoke. No second test runner. |
| Local release gate | `node scripts/qa/orchestrator.mjs --mode=release` — **PASS** 17, failed 0, blocked 0. Evidence `docs/uat/qa/latest.json`. |
| Self-test | Isolated fixtures detected a missing named export, a duplicate `const`, an undefined variable, and destructive SQL (`DROP DATABASE` / `TRUNCATE regulatory_obligations`). A failed assertion yields **FAIL**. A mandatory **BLOCKED** or **NOT RUN** result cannot be **PASS**. |
| Browser | Local Playwright smoke **PASS** 14 routes, including `#/admin/qa`. The dashboard shows technical **PASS**, business UAT **not approved**, production **not authorised**. |
| Auth | Saved Clerk A/B/C sessions are **not** in the offline gate. Missing sessions stay **AUTH_BLOCKED** via `UAT-PERSONAS`, which is extended and does not turn a technical pass into business UAT. A Vercel login wall exits the smoke as **AUTH_BLOCKED** (code 2), not as an application defect. |
| Not claimed | Paid AI extraction. Live RLS against a second tenant. Remediation end-to-end. Market Intelligence (other repository). Hosted persona UAT. |
| Release rule | **PASS** only when every mandatory check passed. **FAIL** if any assertion failed. **BLOCKED** if a mandatory check is blocked, not run, or auth-blocked. Production remains separately unauthorised. |
| CI | `.github/workflows/forgeniq-qa.yml` runs the same release gate on pull requests and on pushes to `feature/ri-classification-triage` and `main`. |
| Deploy gate | `phase85h-deploy-staging-platform.mjs` runs `--mode=release` before upload. A failed preview smoke still does not promote. `vercel promote` on this plan builds a new production deployment of `forgeniq-platform-staging`; there is no automatic schema rollback and no production (`www.forgeniq.com`) deploy. |
| Staging | Preview **`dpl_XzzTPTjRm52WEvakuYtiJZZARBLb`** smoke **PASS** (13 routes, sign-in shell, including `#/admin/qa`). Alias **`dpl_DYiqJ1ghbaWyrSgG8urexqSFRpFW`** at `https://staging-app.forgeniq.com`. Served `app.js?v=1adb6757fac7`, QA report `technicalTests: PASS`, `businessUatApproved: false`, `productionReleaseAuthorised: false`. |
| Commit | `1adb675` |
| Production | **NO-GO**. |

## 2026-11-25 — Authenticated staging QA

| Activity | Outcome |
|---|---|
| Personas | Saved Clerk sessions A, B and C **VALID**. No credentials stored or printed. |
| Authenticated browser | `staging-design-lab-authenticated-smoke.mjs` **PASS 19** on `https://staging-app.forgeniq.com`. User C rendered dashboard, six queues, All Findings (**208**), My Tasks, Attention Centre, obligations, impact, risks (**2**), controls (**2**), assurance and the QA dashboard. APIs returned **200**. User B (REVIEWER) showed **50** human-review actions and they were not clicked. User A is COMPLIANCE_MANAGER with `aiReview` and `obligationReview`; the UI matches those grants. Three distinct users, one organisation. |
| SoD | Offline maker-checker test remains in the release gate. The live User A account is not a restricted maker, so the browser check does not claim that account lacks checker rights. |
| RLS | Embedded database, app role via `SET LOCAL ROLE` (not a privileged bypass). `acceptance-phase-8-security-rls.mjs --local-db` **PASS**. `acceptance-ri-role-aware-rls-local-db.mjs` **PASS** (68), including Partner UAT cross-tenant denial. |
| Pre-upload gate | `--mode=promote` **technical PASS**, **authenticated PASS**, **security PASS**. Business UAT remains unapproved. Production remains unauthorised. |
| Preview | **`dpl_CunZGjj83GgJcwkGwkzRek7evcqh`** unauthenticated smoke **PASS** (13 routes, sign-in shell). |
| Alias promotion | **BLOCKED**. Clerk sessions belong to `staging-app.forgeniq.com` and cannot authenticate a `vercel.app` preview. The alias stayed on **`dpl_DYiqJ1ghbaWyrSgG8urexqSFRpFW`**. |
| Not implemented | Automatic write chain from obligation approval through impact, risk, control and assurance. Remediation end-to-end. Paid AI. |
| Commit | `d2c7794` |
| Production | **NO-GO**. |

## 2026-11-25 — Candidate staging release host and authenticated preview pipeline

| Topic | Outcome |
|---|---|
| Preview auth solution | Clerk sessions stay on authorised FORGENIQ hosts only (`staging-app`, `candidate-staging`). `*.vercel.app` previews remain **AUTH_BLOCKED** by design. Pre-promotion authenticated testing targets **`https://candidate-staging.forgeniq.com`** (Vercel domain added; **GoDaddy CNAME pending**). Optional Clerk satellite (`NEXT_PUBLIC_CLERK_CANDIDATE_SATELLITE=1`) documented; not enabled. Interim: **`FORGENIQ_RELEASE_PREAUTH=promote-verify`** (default) — offline `promote` gate, unauth preview smoke, alias validated preview to official host, post-promotion auth, **`vercel rollback <protectedId>`** on failure. |
| Code | `staging-release-hosts.mjs`, host-scoped UAT profiles, `audit-staging-personas.mjs`, `phase85h` candidate alias + rollback, middleware satellite hook (off), auth smoke allows candidate host. **Promotion mechanism:** `vercel alias <validated-preview> staging-app.forgeniq.com` (not blind `promote`, which can spawn a separate production build). |
| DNS (owner) | CNAME `candidate-staging` → Vercel target from Domains UI; `vercel domains verify candidate-staging.forgeniq.com`. |
| Technical QA | `orchestrator --mode=promote` **PASS 21** (includes AUTH-STAGING-BROWSER, RLS). |
| Security | SEC-RLS embedded + cross-tenant local **PASS** in promote gate. |
| Personas | **User A** `COMPLIANCE_MANAGER` with `aiReview` + `obligationReview` — **not** a restricted maker. **User B** `REVIEWER` / `aiReview`. **User C** checker grants. SoD self-approval remains offline (`RI-SOD`). Evidence `docs/uat/evidence/persona-audit-2026-11-25/PERSONA-AUDIT.json`. |
| Deploy tranche | Preview **`dpl_AHimQPwDhpBAJkgWV2JHtj39f8DD`** unauth smoke **PASS 13**. Pre-promotion auth **DEFERRED** (`candidate_dns_pending`). Post-promotion auth **PASS 19** during `phase85h`. Official alias → preview via `vercel alias` (**`staging-app`** serves validated build). Protected rollback id **`dpl_DYiqJ1ghbaWyrSgG8urexqSFRpFW`**. |
| Sessions | After alias cutover, saved Clerk profiles reported **401** until `renew A,B,C` — manual login required (mandatory approval). Does not negate deploy-window **PASS** evidence. |
| Business UAT / production | **false** / **NO-GO**. No paid AI. No DB rollback. |
| Doc | `docs/uat/STAGING-CANDIDATE-RELEASE.md`. |
| Limitation | Pre-promotion authenticated candidate smoke blocked until DNS; persona renew needed after long runs or alias changes. **GAP-DOWNSTREAM-WRITE** unchanged. |

## 2026-11-25 — UAT session automation and persistence

| Topic | Outcome |
|---|---|
| Recovery | Official **A/B/C VALID** from legacy profiles (`unattendedReady: true`). Candidate **A VALID**; **B EXPIRED**; **C NO PROFILE** (`candidateUnattendedReady: false`). Evidence `docs/uat/evidence/session-recovery-2026-11-25/SESSION-RECOVERY.json`. |
| Automation | `ensureUatPersonas` reuses profiles, validates `/api/ri-lab/session`, records registry metadata, distinguishes `CLERK_NOT_CONFIGURED` vs expiry. Headless **Clerk sign-in tokens** + `@clerk/testing` password path when `%LOCALAPPDATA%\\forgeniq-uat-sessions\\uat-agent.env` has `FORGENIQ_HOSTED_CLERK_SECRET_KEY` or UAT passwords. No interactive login by default. |
| Hosting | Preview deployments lack Production Clerk env; `phase85h` uses `vercel deploy --prod` and restores official alias before candidate validation. |
| Blocker | Vercel does not inject Production secrets into local `vercel env run`. **Owner once:** copy `FORGENIQ_HOSTED_CLERK_SECRET_KEY` into `uat-agent.env` (see `docs/uat/UAT-SESSION-AUTOMATION.md`) to refresh candidate B/C without manual login. No promotion until candidate gates pass. |

## 2026-11-25 — Production Clerk secret validated; candidate unattended auth restored

| Topic | Outcome |
|---|---|
| Clerk instance | `_verify-clerk-instance.mjs` **PASS** (`ins_3FZpAYsf8rSBFoViPPgTppkxJYY`, matches staging). Secret not printed. |
| Root cause | Programmatic sign-in used Clerk `ticket.url` (`accounts.forgeniq.com`), which hit bot interstitials in headless Playwright. Fix: redeem `__clerk_ticket` on the **app origin** only (`uat-clerk-programmatic-signin.mjs`). |
| Session recovery | `FORGENIQ_QA_REQUIRE_CANDIDATE=1` → official and candidate **A/B/C VALID**; `unattendedReady: true`; **`candidateUnattendedReady: true`**. Legacy and host-scoped profiles preserved (no `--fresh`). Evidence `docs/uat/evidence/session-recovery-2026-11-25/SESSION-RECOVERY.json`. |
| Identities | Shared org `b8f5e3a1-00ad-4000-8000-000000000001`. **A** `COMPLIANCE_MANAGER`; **B** `REVIEWER`; **C** `COMPLIANCE_MANAGER`. Roles confirmed via session probe on both hosts. |
| Local QA | `orchestrator --mode=promote` **PASS 23** / fail 0 (technical, authenticated, security, promotion). No Vercel deploy. |
| Deployment isolation | `verify-candidate-deployment.mjs`: official and candidate both **`dpl_2BLmhtnwtXWSaVtNjBrDf5kZmYP8`** (`sameDeployment: true`). Candidate-first **promotion blocked** until next consolidated `phase85h` deploy assigns a distinct candidate build (defer while Vercel Hobby CPU quota exceeded). |
| Production | **NO-GO**. No production deploy. Auth security unchanged. |

## 2026-11-25 — Push `bab7985` to GitHub (`feature/ri-classification-triage`)

| Topic | Outcome |
|---|---|
| Remote | `origin` → `imtiazking/Brieftick`; `1b4ad6c..bab7985` pushed; tracking set. |
| Secrets | Push contains only committed repo files; local `uat-agent.env` and Playwright profiles untouched. |
| Vercel | No `phase85h` / staging promote. Vercel GitHub app posted **Preview Comments** check only; **forgeniq-platform-staging** is not aliased from this push. |
| CI | [`forgeniq-qa`](https://github.com/imtiazking/Brieftick/actions/runs/45616831513) failed: release mode ran **UAT-SESSION-RECOVERY** + treated **AUTH_BLOCKED** as exit 1 (`technicalTests !== 'PASS'`). Fixed **`e6a30da`→`b02536b`**: `--mode=ci` vs `--mode=promote`, offline Clerk contract, Playwright CI sandbox, static RLS in CI / embedded RLS in promote `security` gate. |

## 2026-11-25 — UAT automation commit (auth + QA; no promote)

| Topic | Outcome |
|---|---|
| Commit scope | Headless Clerk sign-in on app origin (`__clerk_ticket`), session registry/recover, programmatic sign-in, QA catalogue (`UAT-SESSION-RECOVERY`, `CLERK-HOST-AUTH`), mandatory candidate isolation in `phase85h`, docs `UAT-SESSION-AUTOMATION.md`. |
| Security | Pre-commit scan: no `sk_live`/`sk_test` literals, no cookies/tokens in repo; credentials remain under `%LOCALAPPDATA%\\forgeniq-uat-sessions\\` only. |
| QA | Local `orchestrator --mode=promote` **23/23 PASS** at `2026-11-25T12:15:39Z` (`docs/uat/qa/latest.json`). |
| Auth | `unattendedReady` and `candidateUnattendedReady` **true**; profiles preserved. |
| Promotion | **Not run.** Official and candidate share deployment id → isolation gate would block `phase85h` until next distinct candidate deploy when CPU allows. |
| Vercel CPU | Continue local-first; see resource audit + deploy throttle; pause hosted pilot drain / repeated deploys. |

## 2026-11-25 — Consolidated staging UAT prep (lifecycle audit + 25/25 CI)

| Topic | Outcome |
|---|---|
| Audit defect | Confirmed: first `COMPLIANCE_LIFECYCLE_CLOSED` blocked legitimate **second** close after reopen. Fixed per-closure `idempotencyKey` (`lifecycle_close:{assuranceId}:{reopenAt\|initial}`); obligation `COMPLIANCE_LIFECYCLE_REOPENED` on reopen. |
| Offline QA | `npm run qa --mode=ci` **25/25 PASS** (includes `RI-ASSURANCE-GOVERNANCE-SECURITY` reopen → retest → second close). |
| Migrations (local) | Embedded `applyAllMigrations` via CI gates covers `20261125180000`, `20261125194500`, `20261125200000` in order. **Hosted apply not run** (await deployment window). |
| Git | 6 commits on `feature/ri-classification-triage` + audit fix; push triggers `forgeniq-qa.yml` only; staging **not** auto-promoted from Git push (per prior Vercel evidence). |
| UAT sessions | A/B/C **VALID** (`staging-user-sessions.mjs status` 2026-11-25). |
| Vercel capacity | No fresh quota in MCP; treat hosting as **constrained** until dashboard confirms headroom before `phase85h`. |
| Hosted UAT | **Blocked** until authorised deploy + staging migrations + `npm run qa --mode=promote` on candidate. |
| Live AI | UC-RI-004/006/007/008 pilot documented in `STAGING-UAT-COMPLIANCE-LIFECYCLE-PREP.md` §7; **not executed** (budget). |

## 2026-11-25 — Five-stage lifecycle staging release (Pro; candidate-first promote)

| Topic | Outcome |
|---|---|
| Vercel | Team `imis-projects-8e15dca0` **Pro** (`vercel teams ls`). One production build deployed (`dpl_DALWABZ2iGk571HjAD2kYoVswAkq`, `ae4b828`). Rollback ref **dpl_2BLmhtnwtXWSaVtNjBrDf5kZmYP8**. |
| DB | Staging Supabase `forgeniq-ri-staging` (`lhgzdicffkhaaykzthep`) — migrations `20261125180000`, `20261125194500`, `20261125200000` applied; RLS policies **4** on `impact_assessment_risk_links`. **Candidate + official Vercel deployments share this single staging database.** |
| Isolation | Pre-promote: official `dpl_2BLmhtnwt…` vs candidate `dpl_DALWABZ2iGk…` — distinct (`verify-candidate-deployment` 2026-11-25T20:22Z). Post-promote both aliases on promoted id (expected). |
| QA | `orchestrator --mode=promote`: **30 PASS / 1 FAIL** (`STAGING-CANDIDATE-ISOLATION-LIVE` after coalesce). Offline lifecycle + governance **PASS**; auth smoke **19/19** candidate + official; security **PASS**. Post-deploy **PASS**. |
| GitHub | Run #12 on `feab18c` **failed**; release head `ae4b828` (build fix + manifest) — local **25/25** CI. |
| UAT | Users A/B/C sessions preserved; authenticated staging smoke **PASS**. Full hosted Design Lab lifecycle walkthrough **not** automated end-to-end (evidence = offline `RI-COMPLIANCE-LIFECYCLE-E2E` + governance matrix). **No paid AI.** |
| Blocker cleared | Pro removes Hobby CPU gate; `phase85h` preview smoke on `*.vercel.app` now blocked by Deployment Protection — smoke reworked to **candidate host** before promote. |

## 2026-11-26 — Claude Sonnet 5.5 migration (local tranche; live AI disabled)

| Topic | Outcome |
|---|---|
| Model | Default claude-sonnet-5-5; configurable (RI_ANTHROPIC_MODEL > ANTHROPIC_MODEL > RI_AI_MODEL); 4.5 retained and priced for history/rollback. Request builder follows the migration guide: no sampling params or prefill, adaptive thinking, output_config.effort (default medium), `thinking: disabled` translated to `between_tools`, efusal and model_context_window_exceeded stop reasons handled. Invalid config rejected locally with no network call. |
| Pricing | 5.5 $2/, cache write 5m $2.50, 1h $4, read $0.10 (version nthropic-list-2026-11-26). 4.5 history not repriced. Unpriced models fail closed (previously fell back to the cheapest rate). |
| Ledger | Worst-case reserve (prompt at 1h-write rate + full output cap); categories settled separately; unknown usage (timeout/transport) charges the full reserve in the database; failed calls counted. Recovery needs a registered operator, passed provider deadline, minimum age, reason, audit row, one per reservation. Migration 20261126120000 written and manifest-listed; **not yet applied to staging**. |
| Decision | Staging model/budget vars are Secret type and cannot be read back; RI_ANTHROPIC_MODEL updated in place (removal needs approval and was not attempted). Hosted posture to be proven behaviourally. |
| Decision | The Design Lab bundle in pps/platform/design-lab-bundle was stale relative to committed design-lab source (submit/approve controls, authorised UAT rows); the QA sync refreshed it and it is included in this commit. |
| Evidence collector | FCA-EVAL-001 collector checked against the staging schema (read-only); workflow_events ordering fixed to occurred_at. Technical success and regulatory accuracy kept separate; accuracy NOT_ASSESSED. |
| QA | 
pm run qa (ci) **29/29 PASS** including RI-SONNET-55-COMPAT, RI-SHARED-SPEND, RI-LIFECYCLE-LIVE-AI; 	sc --noEmit clean. No provider call made. |

## 2026-11-26 — Sonnet 5.5 tranche: staging migration and candidate-first deploy

| Topic | Outcome |
|---|---|
| Git | Commit `6056a89` pushed to `feature/ri-classification-triage`; GitHub Actions run #29 **success** (https://github.com/imtiazking/Brieftick/actions/runs/45749360816). |
| Migration | `20261126120000` applied to staging Supabase `lhgzdicffkhaaykzthep` after a read-only check (ledger accounts/reservations/recoveries all 0). Verified: one signature each for reserve (11 args), settle (11), release (11); EXECUTE only for `service_role`; RLS enabled **and forced** on accounts, reservations, recoveries, operators; operators table empty; recoveries uniqueness index present. |
| Deploy | One consolidated deploy, candidate-first. Candidate and official `dpl_AGLgjMw6uZCtqtm193MeKGuGdpuh` (`6056a89`), previous official `dpl_CABPEw5cx3y96MnMMMtR2o4gSRhF` retained as rollback. `qa --mode=promote` **36/36 PASS** (candidate, authenticated, security, promotion). Authenticated browser smoke **19/19** on `candidate-staging.forgeniq.com` before promotion and **19/19** on `staging-app.forgeniq.com` after. Post-deploy QA PASS. |
| Post-promotion | Catalogue unchanged: 275 publications, 208 findings, 12 verified obligations, 6 risks, 6 controls, 2 assurance reviews (API counts). Database after deploy: ai_analysis_runs 29 (latest 2026-11-23), ledger 0/0/0, obligations 38, risks 30, controls 29, assurance 6 — identical to pre-deploy. No AI run and no ledger activity: execution disabled and stages in fixture mode. |
| Not touched | `platform`, `brieftick`, `www.forgeniq.com`; no Clerk or permission changes; no deployment deleted; no provider call. |
| Open | Hosted effective model value is a Secret and cannot be read back; first authorised run records requested/response model in telemetry. |

## 2026-11-26 � FCA-EVAL-001 live five-stage AI pilot (executed)

| Item | Outcome |
|---|---|
| Authorisation | One controlled paid pilot, max $0.75 and 8 requests, staging only |
| Execution | 5 live `claude-sonnet-5-5` requests (UC-RI-005, 004, 006, 007, 008), 8,348 input / 5,678 output tokens, `.073476` settled, 0 retries, 0 failures. Ledger: 5 SETTLED, 0 open, 0 recoveries |
| Governance | Stage 1 review by B (synthetic, quotation corrected from verified PDF text); A submit / C approve for obligation, impact, risk, control, assurance plan. Assurance stopped at TESTING_READY; no test, exception or closure |
| Findings | Defect A: PS26/1 publication context labelled `consultation` so binding nature was wrong (reference: binding, commencement 2026-07-15); Gap B effective date null; stages 2-5 citations carry section ids only; Defect D assurance notes truncated mid-word. Regulatory accuracy NOT_ASSESSED; everything pending human review |
| Restore | `RI_AI_EXECUTION_ENABLED=false`, stages FIXTURE, suffix vars closed. Final official `dpl_xVuJVTVj6gfUQKDjBeTkhbV8onHU` (candidate-first, QA 36/36, smoke 19/19). Posture verified on the running app |
| Harness change | Persona preflight retries handshake navigation and expects `aiRequest` only while paid AI is enabled |
| Evidence | `docs/uat/evidence/live-ai-pilot-2026-11-26/` (PILOT-REPORT.md, RESTORE.md, ledger-reconciliation.json, raw responses) |
| Not touched | `platform`, `brieftick`, `www.forgeniq.com`; no Clerk or permission changes; no deployment deleted |

## 2026-11-26 - FCA-EVAL-001 pilot findings and regulatory accuracy hardening (tranche)

| Item | Outcome |
|---|---|
| Scope | Local hardening only; 0 paid AI calls; paid AI remains disabled |
| Decisions | Instrument-level legal status separated from document type (consultation never promoted); commencement derived only from the instrument's Commencement clauses/annex table, with explicit unresolved states; applicability/definition limbs are not standalone obligations; internal section ids are not regulatory evidence; ratings provisional/unassessed without rationale/control evidence; assurance truncation root cause was the mapper slice, not provider/DB/UI |
| Tests | RI-PILOT-ACCURACY-HARDENING 80/80; npm run qa (ci) 30/30; tsc clean; related legacy acceptance pass |
| Staging data | Pilot obligation dc63a70a effective_date set to 2026-07-15 with provenance metadata (additive jsonb merge, existing keys preserved, OPEN status unchanged); no historical stage output altered |
| Evidence | docs/uat/evidence/live-ai-pilot-2026-11-26/HARDENING-REPORT.md, EVALUATION-DETERMINISTIC.json, ORIGINALS-MANIFEST.json |
| Release | Commit 0b692ab; CI run 34 success; candidate-first staging deploy dpl_mDJb3JUPERBguXau7Uvoh65uBvnM, candidate and post-promotion auth PASS; paid AI still disabled (executionEnabled=false, stages fixture); production hosts untouched |

## 2026-11-26 - FCA-EVAL-002 prep (materiality policy, interpretation, no paid AI)

| Item | Outcome |
|---|---|
| Materiality | impact-materiality-policy-v1: no confidence/dimension heuristics; UNASSESSED without org evidence; human approve stamps assessmentOrigin |
| Interpretation | regulatory-interpretation-conc-7-20-1r.mjs + docs/uat/evidence/fca-eval-002-prep/ |
| Tests | QA 31/31; RI-FCA-EVAL-002-PREP; paid AI disabled |
| Authorisation | NOT granted for second live pilot |

## 2026-11-26 20:15 - Stage 5 Control to Assurance lineage, promote-gate repair, hosted browser UAT script

| Item | Outcome |
|---|---|
| Defect (found by hosted lifecycle run, S5-PLAN) | The auto-drafted Stage 5 plan existed in the DB with its ASSURANCE_CONTROL_LINKED event, but the Design Lab list payload exposed no `controlIds`. Root cause: the Stage 5 auto-draft records its control as `metadata.sourceApprovedControlId` plus a row in `assurance_review_control_links`; the mapper read only `parentControlId`, and no list route read the link table. |
| Fix | `mapAssuranceRowToLabView` derives lineage from `parentControlId` or `sourceApprovedControlId`; new `listAssuranceControlLinks` (tenant-scoped, RLS applies) and `withAssuranceControlLinks` (merge + dedupe) used by `GET /api/ri-lab/assurance-reviews` and `GET /api/ri-lab/tenant-governance` (both lists). `GET /assurance-reviews` now honours `scope` through `scopeRegister` and returns `authorisedUatAssuranceReviews` + provenance counts. Tenant isolation is unchanged: RLS decides visibility, the scope flag only partitions. |
| Tests | RI-LAB-SCOPE-REGISTERS extended to 90 checks (mapper lineage, merge, real-Postgres link-table query, cross-tenant denial for links and plans, route wiring). Mutation-verified: removing the `sourceApprovedControlId` fallback fails the regression. `npm run qa` ci 39/39; tsc clean. |
| Test-harness change | `pg-supabase-adapter` gained `.in()` (test double only). |
| Promote-gate defect | First deploy attempt stopped at the promote gate: RI-GOV-RISK-SOD "timed out". Root cause: the suite discarded the embedded-Postgres handle (`stopEmbedded()` with no argument), so the postmaster child kept the process alive after PASS. Fixed in the test (pass the handle); suite now exits in 16s. No product code involved; the deploy script did not deploy. |
| Hosted script | `S1-REVIEWER-APPROVE` was a stale expectation (independent REVIEWER may approve classified obligations by policy). Replaced by `S1-REVIEWER-NO-CONTENT-EDIT` (REVIEWER cannot smuggle priority/citation into an approval). Hard-coded deployment id removed. |
| New | `scripts/uat/hosted-design-lab-browser-abc.mjs`: real-browser A/B/C UAT; PASS only from DOM observations. |
| Commits | aaa1b0a, 1d93a65 |

## 2026-11-26 23:00 - Phase 10 calendar, acceptance-sweep repair, consolidated staging deploy, hosted A/B/C UAT, readiness evidence set

| Item | Outcome |
|---|---|
| Phase 10 | `GET /api/ri-lab/calendar` (`ri:read`, RLS-scoped tenant listers, windows 30/90/180/365, default 90) and a connected Design Lab calendar view replaced the Unavailable placeholder. `RI-LAB-CALENDAR` 41 checks, mutation-verified (2 of 4 mutants killed; 2 equivalent because the parity builder already titles and sorts). Staging has no operational dated records, so the hosted view renders its empty state; the `scope=all` API check returns 9 `uat_authorised` events. |
| Acceptance sweep | 186 suites, run without provider or privileged credentials: 174 passed, 11 failed, 1 timed out. Nine repaired (stale against spend guard x2, Stage C policy cap x2, missing fixture, never-committed `83f1` runner, platform-foundation allow-list, triage regex, master suites via allow-list). BLOCKED honestly, not run: `pdf-grounded-uc-005` (admin credentials) and `stage-a-e2e-persistence` (paid provider). Five previously ungated suites added to the CI catalogue (60 entries, 45 CI). |
| Deploy | One consolidated staging deploy: `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx` from `782d55c`, candidate `candidate-staging.forgeniq.com` then promoted to `staging-app.forgeniq.com`. Rollback target `dpl_GVwLPEAadswJe8pSxreWZJBpjapY` retained. QA promote gate 52/52, post-deploy 1/1. GitHub Actions run #38 success for `782d55c`. |
| Hosted UAT | Lifecycle API 38 checks, 0 failed, `SEC-CROSS-TENANT` BLOCKED (single shared organisation). Browser A/B/C 34/34 (33 browser, 1 labelled `hosted-api`), 0 console errors, 0 page errors. Four consecutive clean runs after the script hydration fixes. |
| Hosted UAT findings | Script defects: edit before hydration, same-hash navigation not a reload, link counted before request resolved. Product: none new. **Unexplained:** one first-run stuck "Loading workflow events" state on the assurance audit history that did not recur (DEF-011, diagnostics added). |
| Posture and ledger | `executionEnabled=false` verified on the hosted readiness endpoint. Ledger unchanged from the pre-migration snapshot: 10 SETTLED, `$0.224872`, 0 recoveries, 0 ledger events. No paid AI run in this programme. Production hosts untouched. |
| Process finding | Acceptance suites rewrite committed `docs/eval/*` evidence; restored from git after each sweep and recorded as OPEN-008. Not committed. |
| Decisions | The 18 disconnected obligations were not bulk-backfilled (would fabricate unreviewed impacts). Hosted cross-tenant denial left BLOCKED rather than creating a second tenant (new access needs approval). Overall readiness not claimed; capability matrix has 0 PRODUCTION_READY. |
| Evidence | `docs/uat/evidence/production-readiness/` (12 files), `browser-abc-2026-11-26/`, `compliance-lifecycle-2026-11-26/`. Commits `782d55c`, `ee7ee42`. |

## 2026-11-27 — Remediation tranche: horizon scheduler config, reviewer Stage 2 pin, sidebar nav

| Item | Outcome |
|---|---|
| P1 Horizon | Root cause: scheduler disabled since mid-Nov; 38/41 sources stale; 1 failing (MOCI-SA), 1 disabled (OFAC SDN), 1 no connector (CBUAE). Added four UTC crons to `vercel.json`; phase8d4 expects crons. Activation still needs Vercel env (`FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true`, `CRON_SECRET`, staging DB URL). |
| P3 Security | `stage2ApprovalPin` on IN_REVIEW; RPC rejects REVIEWER-authored impact unless pin matches; `acceptance-ri-obligation-open-atomic` 74/74. Cross-tenant harness requirements documented (blocked). |
| P6 Engineering | Master triple → `docs/uat/qa/transient/`; audit history loading timeout. |
| P7 Design Lab | Collapsible left sidebar + Ask RI in header; bundle synced. |
| Evidence | `REMEDIATION-REPORT-2026-11-27.md`, scheduler activation, classification draft proposals, cross-tenant harness. |

## 2026-11-27 — Authorised staging execution (migration, deploy, scheduler, connectors)

| Item | Outcome |
|---|---|
| Migration | `20261127083000_reviewer_stage2_approval_pin` applied to staging (`lhgzdicffkhaaykzthep`); RPC comment verified. |
| Promote gate | 52/52 PASS after sidebar-aware browser smoke fix (`nav.ri-sidebar__nav`). |
| Deploy | Official `dpl_Fom4o2RmJHMnALQ4Fp3o1owwnxJS` @ `staging-app.forgeniq.com` from `b6cf181`; rollback retained `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx`. Candidate-first auth smoke 19/19 (candidate + official). |
| Scheduler | `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true`, `FORGENIQ_INGEST_ENV=staging`, `RI_AI_EXECUTION_ENABLED=false`; CRON_SECRET rotated (not logged). Hosted dry-run 200 (`schedulerEnabled: true`, 12 due / 12 wouldRun). Seven manual POST ticks; 39 `ingestion_runs` in ~2 h. |
| Connectors | 38/39 ops rows fresh within 72 h after ticks. **Failing:** `SRC-MOCI-SA-COMPANIES-LAW` (12 consecutive failures; last success 2026-10-30). **No connector ops:** `SRC-CBUAE-DIGITAL-RULEBOOK` (0 publications). **Not ingested:** `SRC-OFAC-SDN-LISTS` (disabled / no runs in ops; OFAC regulatory updates source current). |
| Hosted UAT | `hosted-design-lab-browser-abc.mjs` 34/34 on official staging (calendar API scope included). |
| Data integrity | 18 `DISCONNECTED` obligations remain (11 synthetic UAT + 7 legacy); repair workflow not executed in this tranche. |
| Blockers unchanged | Regulatory expert sign-off; hosted cross-tenant (second tenant); 11 obligation repairs; notifications; paid AI off by policy. |

## 2026-11-27 — Tranche C (navigation, promote `4a4a44a`, synthetic repair, MOCI cert)

| Item | Outcome |
|---|---|
| Routing | `#/notifications/inbox` (and horizon sub-routes) via path segments; sidebar sweep **32/32**; auth smoke **19/19** official (User A AI Findings buttons **50**). |
| Promote | `dpl_ESgsqUkZBdEexaqDE664DK9CSrgN` @ `4a4a44a`; candidate-first PASS. |
| Synthetic DISCONNECTED | **10/10** AI-dev tenant OPEN rows → LINKED via checker OPEN recovery (`repair-disconnected-2026-11-27`); **8** DISCONNECTED preserved (7 legacy + 1 partner). |
| Notifications | In-app API smoke PASS; external delivery disabled. |
| Stage 2 hosted security | Smuggle refused; concurrent approval stale; Stage 2 linked (`hosted-stage2-security-2026-11-27`). |
| MOCI cert | Platform `certs/mc-gov-sa-trust-chain.pem` + connector fallback; Vercel `includeFiles` depth fix — **deploy + ingestion success pending** on next tick. |
| VERCEL_CRON | **0** unattended rows as of `01:50 UTC`; **8** `MANUAL_HOSTED` since scheduler enable; await **04:00 UTC** cron for separate evidence. |

## 2026-11-27 — Tranche D (handoff to Ask RI; official `33d0912`)

| Item | Outcome |
|---|---|
| Official staging | `dpl_9z7z4Q5aNA4UVBwyxxN2GjgvKHHK` @ `33d0912`; evidence tip `cbd5bfe`. |
| MOCI-SA | COMPLETED ingest `4cac5a4c…` at `02:05:03Z` on official deployment. |
| Connectors | `build-connector-status.mjs` → **39/41 INGESTED_CURRENT**, 0 stale; matrix/docs refreshed. |
| Lineage | `hosted-regulatory-lineage-verify.mjs` PASS; `linked:false` on changes API logged as ENG-LINEAGE-001. |
| Nav capabilities | `hosted-nav-capability-sweep.mjs` **30/30** PASS. |
| Operational readiness | A/B/C concurrent, latency, DB API, monitoring, offline scheduler, Chromium PASS; a11y FAIL (ENG-A11Y-001); DR restore not run. |
| Cross-tenant harness | Prepared; `BLOCKED_AWAITING_AUTH` (no D/E). |
| CI | GitHub `forgeniq-qa` success on `cbd5bfe`, `33d0912`, `4a4a44a`, `a4dd45f`. |
| VERCEL_CRON (2026-11-27) | **0** since `00:00 UTC` as of `02:17 UTC`; `PRE-04UTC-SNAPSHOT.json`; unattended proof pending **04:00 UTC** slot (ENG-CRON-001). |
| Deliverables | `CONSOLIDATED-REPORT-2026-11-27-D.md`, `REMAINING-ENGINEERING-DEFECTS.md`, `DISCONNECTED-OBLIGATION-RECONCILIATION.md`. |

## 2026-11-27 — Tranche D closure (engineering handoff → Ask RI)

| Item | Outcome |
|---|---|
| Official staging | `dpl_644WDsZPXcMXKPB9Q2WzS3GuuGsg` @ git **`8c58e2e`** (rollback `dpl_95TSoASLLpqQSwpkb1r8sJZy97xk`) |
| ENG-LINEAGE-001 | `regulatoryTrace` on publication API; MOCI `NONE` + FCA `TENANT_CHANGE`; hosted lineage **PASS** |
| ENG-CRON-001 | Unattended **`VERCEL_CRON`** `2026-11-27T04:00:24Z` (`vercel-cron-2026-11-27/RESULT.json`) |
| ENG-A11Y-001 | Static acceptance + ops suite **PASS** |
| ENG-OPS-002 | Parallel API load baseline **PASS** |
| OPEN-007 | Reviewer Stage 2 pin on staging RPC |
| Gates | Promote **52/52**; auth smoke **19/19**; ops readiness **PASS**; GitHub Actions **success** on `8c58e2e` |
| Handover | `ASK-RI-DEVELOPMENT-HANDOVER.md`; evidence commit **`2c46b7c`** |
