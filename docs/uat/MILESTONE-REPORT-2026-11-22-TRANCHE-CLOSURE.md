# Implementation tranche closure — 2026-11-22

## Priority 1 — Closed

- Remaining implementation, design-lab bundle, migration SQL, tests and eval JSON committed.
- `package-lock.json` vercel churn **reverted** (local CLI-only; not a platform dependency).
- Cross-page migration **reconciled**: staging already has `20261122163000_ri_cross_page_provision_citation` + restore; **not re-applied**.
- Clean DB reproducibility: `acceptance-ri-rpc-migration-canonical.mjs` **13/13**.
- Staging RPC preflight: `v_provision_section` present; no `migration_apply_incomplete` placeholder.
- Staging deploy + P2 regression post-commit (see `EXECUTION-LOG.md`).

## Priority 2 — Live pilot readiness (no paid execution)

- `LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-READINESS-2026-11-22.json` — PS26/1 ~**$0.24** (2 batches), PS22/9 ~**$0.56** (4 batches), combined ~**$0.80** deterministic estimate.
- Gates: inventory, batch plan, scoped grounding sample, orchestration spend cap, dedupe, consolidated review, failed-batch retry path documented.

## Priority 3 — Regulator expansion (draft)

- PRA, ICO, PSR, FRC drafts in `REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json`.
- Rollout: `docs/governance/REGULATOR-CLASSIFICATION-ROLLOUT-PLAN-2026-11-22.md`.
- FRC suspension package unchanged pending operator approval.

## Priority 4 — Backlog

- `SECURITY-BACKLOG.md` SEC-DB-001..003 remain production blockers (DB migrations required).
- Platform foundation master acceptance still flags frozen RI tree / env heuristics — RI subset green.