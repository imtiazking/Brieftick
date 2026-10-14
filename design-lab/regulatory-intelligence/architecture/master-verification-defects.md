# Master verification defect log

Defects found during Final Master Verification (Design Lab only). All listed items were corrected and re-tested.

| ID | Severity | Area | Steps | Expected | Actual | Fix | Retest |
|----|----------|------|-------|----------|--------|-----|--------|
| MV-DEF-001 | P2 | Live regulatory UI acceptance | Run `acceptance-live-regulatory-ui.mjs` after fresh live FCA run | Admin Sources shows current FCA `lastVerifiedAt` from evidence | Test asserted hard-coded `2026-10-08` / `08 Oct` | Derive expected stamp from `fixtures/live-verification-evidence.json` via `formatDateTime` | PASS |
| MV-DEF-002 | P3 | Migration helper test | Run `test-migrate.mjs` | Fresh persist migrates to schema **10** | Script expected schema **2** | Update assertion to `schemaVersion === 10` | PASS |
| MV-DEF-003 | P3 | Store propagation test | Run `test-propagation.mjs` | IA-0042 baseline matches seed before submit | Expected `Implementation`; seed is `Draft` | Align baseline expectation with seed (`Draft`) | PASS |

No open P0 or P1 defects remain after retest.
