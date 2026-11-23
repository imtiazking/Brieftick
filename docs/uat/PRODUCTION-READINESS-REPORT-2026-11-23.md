# FORGENIQ Regulatory Intelligence — production readiness report (2026-11-23)

**Decision: NO-GO for production** (mandatory governance unchanged). Staging application deploy, live extraction pilot, hosted SEC-DB API validation, and RI master ×3 all advanced this tranche; PS22/9 live extraction and verified extraction accuracy remain open.

## Readiness tiers

| Tier | Definition | Decision |
|---|---|---|
| **1 — FCA pilot** | FCA corpus + staging UAT + authorised live extraction for PS26/1 & PS22/9 | **NO-GO** — PS26/1 live batches complete (processing coverage); PS22/9 batch 0 **FAILED** (`AI_OUTPUT_SCHEMA_INVALID`, billed — no auto-retry); claim-level precision/recall not yet measured |
| **2 — Wider RI** | Multi-regulator catalogue, ingestion, classification fail-closed, platform UAT | **NO-GO** — FCA verified/activated; FRC suspended; catalogue manifest reconciled (`SRC-SEC-FEDERAL-REGISTER`) |
| **3 — 36 regulators** | Verified policy per regulator + activation + UAT | **NO-GO** — 1 verified active (FCA); remainder draft/fail-closed per `REGULATOR-READINESS-MATRIX-2026-11-23.json` |

## Git and staging

| Item | Value |
|---|---|
| Branch | `feature/ri-classification-triage` |
| Baseline commits | `e0d1994`, `e61581a`, `1160a8b` (+ uncommitted continuation-batch fix deployed) |
| Staging alias | **https://staging-app.forgeniq.com** |
| Team / project | `imis-projects-8e15dca0` / `forgeniq-platform-staging` |
| Deployments (this tranche) | `dpl_5qEo4k5BbDynN5Le6Long7q1orXt` (poll/grounding), then `dpl_7b2D9aKeN2EdGJhC4ZGp6SiCg2eS` (continuation `extraction_batch_out_of_range` fix) |
| Runtime health | `GET /health` → **200** |
| Production | **Not deployed** |

## Priority 1 — Live full-publication extraction

| Item | Status |
|---|---|
| Batch 0 PS26/1 | **Reused** — run `2c840c0b-0534-4429-a02d-6db8850a3f91`, idempotency `live-ps26-full-2026-11-22`, **COMPLETED** (no duplicate paid POST) |
| Batch 1 PS26/1 | **COMPLETED** after continuation-batch fix — run `6f05a9eb-8984-4a2b-8b78-2e7effbf8892`, idempotency `live-ps26-full-2026-11-22-batch-2` |
| PS26/1 processing coverage | **47/47 supplied** (orchestration); **7 unresolved provision cores** in reconciliation (`16.1.6R`, `2.7.19GG`, `2.7.19HG`, `2.7.7FG`, `2.8.6CG`, `8.12.11AG`, `TP 13.5G`) — **not** extraction recall |
| PS22/9 batch 0 | **FAILED** — run `147574c3-229a-42e3-9adb-fd480b905d3b`, `AI_OUTPUT_SCHEMA_INVALID` (Anthropic `stopReason: max_tokens`); ~**$0.155** billed — **no automatic retry** per spend policy |
| Estimated spend (token audit) | **~$0.38** of **$2.00** ceiling (`LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json`) |
| Verified extraction metrics | **Pending** — claim-level reconciliation vs `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json` (and PS22/9 benchmark when extraction completes) |
| Evidence | `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json`, `LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json`, `LIVE-EXTRACTION-ACCEPTANCE-CRITERIA-2026-11-23.md` |

**Next (no auto-retry on PS22/9 batch 0):** operator-authorised new idempotency suffix and/or smaller `maxSectionsPerBatch` (pilot script now **12** for PS22/9) after root-cause acceptance; resume orchestration from failed ledger state.

## Priority 2 — Master acceptance

| Item | Status |
|---|---|
| Standalone phases | Phase 7C.6A, 7C.7, source semantics, catalogue **PASS** (post-manifest) |
| RI master ×3 | **IN PROGRESS / STALLED** — run **1/3** reached **FCA RSS Phase 8B** (~90+ min idle in log); investigate `acceptance-fca-rss-phase8b.mjs` hang before runs 2–3 |
| Acceptance added locally | `acceptance-ri-extraction-continuation-batch-index.mjs` **PASS** |

## Priority 3 — SEC-DB (hosted)

| Control | Local | Staging API (Users A/B/C) | Staging DB triggers |
|---|---|---|---|
| SEC-DB-001 finding close (maker-checker) | 5/5 | **PASS** — B 403, C closes | `ri_guard_finding_close` |
| SEC-DB-002 creator binding | 5/5 | **PASS** — creator from session on POST | `ri_guard_manual_finding_creator` |
| SEC-DB-003 audit immutability | 5/5 | **Skipped** (no DELETE on `workflow_events` API) | `ri_guard_workflow_events_immutable` — use `STAGING_DATABASE_URL` harness for negative DELETE |

Evidence: `SEC-DB-STAGING-API-VALIDATION-2026-11-23.json` (6 pass, 0 fail; 003 documented skip)

## Priority 4 — Regulators

Unchanged core: **FCA** operational; **FRC** active with conversion suspended; **PRA, ICO, PSR** draft-only.

## Priority 5 — E2E platform UAT

Partial staging sessions; full journey deferred until PS22/9 extraction path completes.

## Consolidated decision

| Scope | GO? |
|---|---|
| FCA-only production pilot | **NO** |
| Wider RI production | **NO** |
| 36-regulator production | **NO** |

## Intervention only if

1. **PS22/9 continuation** — new paid batch requires explicit approval (batch 0 already billed).
2. **RI master ×3** — if Phase 8B network hang cannot be cleared without operator environment change.
3. **SEC-DB-003** — `STAGING_DATABASE_URL` for immutability negative test (optional; triggers already inventoried).