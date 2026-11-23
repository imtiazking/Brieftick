# FORGENIQ Regulatory Intelligence — production readiness report (2026-11-23)

**Decision: NO-GO for production** until live extraction accuracy is evidenced under acceptance criteria and RI master passes three consecutive full runs.

## Git and staging

| Item | Value |
|---|---|
| Branch | `feature/ri-classification-triage` |
| Head commit | `2707ac6` (async UC-RI-005 dispatch, Phase 3A harness, pilot recovery) |
| Staging deployment | `dpl_Hrtx7ABaxJBZBBxt9mBYnEZtVYuc` @ `https://staging-app.forgeniq.com` |
| Production | **Not deployed** |

## Workstream 1 — Live full-publication extraction

| Item | Status |
|---|---|
| Provision inventory reconcile | PS26/1 **47** / PS22/9 **242** (read-only plan API) |
| Orchestration persistence | Tenant `organisation_publications.metadata._extractionOrchestration` |
| Transport remediation | **Implemented** — `202 Accepted` + `after()` provider dispatch; idempotency GET; pilot transport recovery |
| Paid batch completion | **In progress / pending evidence** — see `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json` |
| Acceptance criteria | `docs/eval/LIVE-EXTRACTION-ACCEPTANCE-CRITERIA-2026-11-23.md` |
| Authorised AI spend cap | **$2.00** (no automatic paid retries) |
| Actual spend (session) | Pending pilot completion (structured_output `_forgeniqSpend` / lab audit) |

**Outstanding:** Complete 6 paid batches; run accuracy reconcile vs `PS26-1-PROVISION-SOURCE-VERIFICATION` / `PS22-9-PROVISION-SOURCE-VERIFICATION`; report precision/recall and unresolved cores.

## Workstream 2 — Phase 3A reproducibility

| Item | Status |
|---|---|
| Windows shared-memory / EBUSY | **Mitigated** — random port selection, retry on init failure, per-port data dirs, post-stop delay |
| Phase 3A clean cycle ×2 | **PASS** (2026-11-23 run) |
| RI master ×3 consecutive | **Not completed** — use `acceptance-ri-master-triple.mjs` (long-running; prior single master run still open at time of report) |

## Workstream 3 — FRC policy suspension

| Item | Status |
|---|---|
| OP1 propose REG-FRC v2 (all `conversionEnabled: false`) | **PASS** — policy `fed40928-…` |
| OP2 activate | **PASS** — active version **2**, `allConversionDisabled: true` |
| Evidence | `docs/eval/REG-FRC-SUSPENSION-APPLIED-2026-11-22.json` |
| Admin writes restored disabled | Env set `RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED=false` (redeploy to enforce at runtime) |

## Workstream 4 — Regulator policies (36 / 41 sources)

| Regulator | Draft | Verified | Approved | Activated | Tested |
|---|---|---|---|---|---|
| FCA | Yes | Yes | Yes | Yes | Yes (staging UAT corpus) |
| PRA | Draft only | No | No | No | No |
| ICO | Draft only | No | No | No | No |
| FRC | Draft + **suspended ACTIVE** | No | Operator only | Yes (fail-closed convert) | Partial |
| PSR (REG-PSR-UK) | Draft only | No | No | No | No |
| Other 31 regulators | See matrix | No | No | No | No |

Full matrix: `docs/eval/REGULATOR-READINESS-MATRIX-2026-11-23.json`.

**Mandatory activation approvals** remain consolidated — no unverified policies activated beyond FCA and FRC suspension.

## Workstream 5 — Production readiness checklist

| Area | Status | Notes |
|---|---|---|
| SEC-DB-001/002/003 | Staging applied; local **5/5** | Production promotion needs approval |
| SEC-GOV-001 | Not re-verified this session | Prior staging operator UAT |
| Tenant isolation / RBAC | Master phases 2–3A | — |
| End-to-end UAT | Partial | P2 regression + targeted pilots; full RI UAT matrix open |
| Connectors / scheduling | Phase 6–8 acceptance scripts | Not full staging scheduler proof this session |
| AI spend controls | Suffix guard + async dispatch | — |
| Migration reproducibility | Phase 3A **PASS** | Triple master pending |
| Rollback plan | Staging redeploy + env revert | Documented in deploy JSON artefacts |

## Genuine blockers (non-fabricated)

1. **Live extraction accuracy evidence** not yet complete for PS26/1 + PS22/9 full publication runs.
2. **Three consecutive RI master passes** not yet recorded.
3. **Production deployment** explicitly out of scope without approval.
4. **31 regulators** still require authoritative policy research before activation.

## Recommended next actions (autonomous where authorised)

1. Allow live pilot to finish; emit accuracy reconcile and spend totals.
2. Run `node scripts/acceptance-ri-master-triple.mjs` to completion.
3. Staging security smoke for SEC-DB on tenant paths (read-only + negative probes).
4. Schedule production go/no-go review after blockers 1–2 clear.