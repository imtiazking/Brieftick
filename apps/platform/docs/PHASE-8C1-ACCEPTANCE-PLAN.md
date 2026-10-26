# Phase 8C.1 — Acceptance test plan

Planned scripts (to implement in 8C.1b–e):

| ID | Scenario | Expected |
|----|----------|----------|
| S1 | New publication ingest (FCA HTML fixture) | Version 1 + snapshot row + 4 storage objects; hashes consistent |
| S2 | Updated hash → new version | Version 2 + new snapshot; v1 snapshot unchanged |
| S3 | Unchanged hash re-ingest | `UNCHANGED`; no new snapshot; no storage writes |
| S4 | Storage upload failure (mock) | DB rollback; no version bump; item FAILED |
| S5 | DB failure after upload (mock) | Orphan objects; no snapshot row; reconciler can delete |
| S6 | Duplicate snapshot insert | Unique on `publication_version_id` — second attempt no-op / linked |
| S7 | Integrity verify | Tampered object fails HEAD/hash check |
| S8 | Missing object | Operator read returns explicit error |
| S9 | Fingerprint consistency | `source_fingerprint === version.source_hash === SHA-256(norm html)` |
| S10 | Tenant RLS | Authenticated non-operator cannot SELECT snapshots |
| S11 | Immutability | No UPDATE policy on snapshots table |
| S12 | Ingestion regression | `acceptance-phase-8b-fca-ingestion.mjs` + RI master still PASS |
| S13 | No auto regulatory change | Hash change does not insert `regulatory_changes` |
| S14 | Pilot pubs without snapshot | UI/metadata shows snapshot unavailable (no fabricated rows) |

## Regression commands (existing)

```bash
cd apps/platform
npm run typecheck
npm run test:acceptance:phase8b-fca
npm run test:acceptance:ri
```

## New (planned)

```bash
node scripts/acceptance-phase-8c1-source-snapshots.mjs
node scripts/acceptance-phase-8c1-snapshot-storage-contract.mjs  # mock storage
```

## PASS criteria

- All S1–S13 pass in local embedded Postgres + storage mock.
- Staging: manual operator can list snapshot metadata; cannot download without operator role.
- No migration applied until explicit ops approval.
