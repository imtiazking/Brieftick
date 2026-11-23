# Milestone report — 2026-11-23 (autonomous tranche continuation)

## Summary

| Priority | Status | Evidence |
|---|---|---|
| P1 Live full-publication extraction | **Partial** — orchestration + spend guard fixed; **first paid batch not completed** (suffix/env); re-run authorised | `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json` |
| P2 SEC-DB-001/002/003 | **Done (staging)** — migration applied; **5/5** local acceptance | `20261122233000_ri_security_db_hardening.sql`, `acceptance-ri-security-db-local-db.mjs` |
| P3 FRC policy suspension | **Blocked** — platform operator 1 staging session expired (401) | `frc-suspend-conversion-policy.mjs` |
| P4 `acceptance-ri-master` | **Partial** — Phase 7C.1 fixed; full master still fails Phase 3A on Windows embedded-Postgres shared-memory collision when suites run back-to-back | `acceptance-phase-7c1-golden-master.mjs` |
| P5 Regulator drafts | **Unchanged** — drafts remain unverified; not activated | `REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json` |

## Staging deploys (no production)

| Git | Deployment |
|---|---|
| `bd4f7c6` | `dpl_34zB33ouYFhW7B1HSqUeLmR3qDsW` |
| `f78c424` | `dpl_BUpCHLgwoqi1FTvVfkLUFf6tsSff` |
| `08a5833` + env suffix update | pending final deploy in this session |

## Priority 1 — live pilot

**Authorised:** PS26/1 (~$0.24) + PS22/9 (~$0.56), combined cap **$2**, **no auto-retry**.

1. **Batch plan reconcile (read-only):** PS26/1 **47** provisions / **2** batches; PS22/9 **242** / **4** batches — `publicationCoverageCompletePlanned: true`.
2. **Defect fixed:** orchestration ledger was written to non-existent `regulatory_publications.metadata` → now **`organisation_publications.metadata._extractionOrchestration`** (`20261122234500_organisation_publication_extraction_orchestration.sql`).
3. **Spend guard:** registered staging `RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES` for `live-ps26-full-2026-11-22` (+ batch-2) and `live-ps22-full-2026-11-22` (+ batches 2–4); redeploy required before paid runs.
4. **Processing vs accuracy:** pilot script fails closed on zero batches; precision/recall still measured against `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json` / `PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json` after successful runs complete.

## Priority 2 — security

Database guards on staging: finding close (COMPLIANCE_MANAGER+), manual creator binding, `workflow_events` immutability (break-glass `app.audit_maint`). Local acceptance **5/5**.

## Priority 3 — FRC

Script ready (`frc-suspend-conversion-policy.mjs`). Requires valid OP1/OP2 sessions and `RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED=true` on staging; run once sessions restored.

## Priority 4 — master acceptance

- Phase **4/5** allowlists updated for isolated AI module tree (not weakened lifecycle assertions).
- Phase **7C.1** golden master: presentation mode + dashboard parity alignment (**PASS**).
- Phase **3A** intermittent on this host: embedded Postgres `pre-existing shared memory block` when prior suite has not released — use isolated port dirs (`harness.mjs`); rerun 3A alone after other suites stop.

## Mandatory checkpoints

- **No production** deploy or spend beyond **$2** cap.
- **FRC suspension** and **OP1 login** need your intervention.
- **Live pilot** can resume after staging redeploy confirms new suffixes (script: `live-full-publication-extraction-staging.mjs`).