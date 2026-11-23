# FORGENIQ — consolidated readiness report (2026-11-23, remediation tranche)

**Decision: NO-GO for production** (unchanged). Staging build **`02116db`** on **`dpl_74xgsTcvQzCp1xW8PCcd7sdHbJ1h`** (`staging-app.forgeniq.com/health` verified).

## Evidence index

| Workstream | Evidence |
|---|---|
| PS26/1 provision audit | `docs/eval/PS26-1-UNRESOLVED-PROVISION-AUDIT-2026-11-23.json` |
| Live pilot ledger | `docs/eval/LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json` |
| Spend / coverage (not recall) | `docs/eval/LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json` |
| FCA accuracy benchmark (partial) | `docs/eval/FCA-EXTRACTION-ACCURACY-BENCHMARK-2026-11-23.json` |
| SEC-DB API staging | `docs/eval/SEC-DB-STAGING-API-VALIDATION-2026-11-23.json` |
| SEC-DB-003 local | `acceptance-ri-security-db-local-db.mjs` 5/5 |
| Git | `feature/ri-classification-triage` @ `41d7e52` |

## Priority 1 — PS26/1 (seven provisions)

**Root cause (defect, fixed in `d46e650`):** orchestration replay of batch 0 did not sync cumulative supply into the provision inventory before `finalizeProvisionInventoryOutcomes`; seven batch-1 cores stayed `IDENTIFIED` → reported as `UNRESOLVED` despite 47/47 orchestration supply.

**Deterministic audit (no paid AI):** all seven were **supplied in batch 1** with authoritative PDF text on pages 67–107. Classifications:

| Core | Text status | Outcome after fix |
|---|---|---|
| 16.1.6R | NEW_TEXT | Exception / human review (table context) |
| 2.7.19GG/HG, 2.7.7FG, 2.8.6CG, 8.12.11AG | AMENDMENT_MARKUP_UNCERTAIN | Explicit **exception triage** (not auto non-obligatory) |
| TP 13.5G | NEW_TEXT + duty language | **Transitional exception triage** |

**Hosted reconcile:** `POST …/extraction-orchestration` `action: reconcile_provision_inventory` (deployed) — **blocked** until User A staging session is refreshed.

## Priority 2 — PS22/9 truncation

- **Historical run** `147574c3-229a-42e3-9adb-fd480b905d3b` preserved (`max_tokens` → invalid JSON).
- **Mitigations shipped:** smaller batches (pilot `maxSectionsPerBatch` 4 for replacement), `extraction-output-preflight.mjs`, scaled output caps, preflight fail-closed before paid call.
- **Replacement batch 0** (`live-ps22-replace-batch0-2026-11-23`): **executed once** — run `3872aebf…` **FAILED** (invalid/truncated JSON, **7380** output tokens, **$0.136**). Suffix allowlist **9** entries active. **No automatic paid retry.** Evidence: `PS22-9-BATCH0-REPLACEMENT-2026-11-23.json`, `PS22-9-BATCH0-RECONCILE-2026-11-23.json`.
- **Preflight retune** (`02116db`): higher token estimate + truncation classification in lab Anthropic path.

**Spend forecast:** ~**$0.52** pilot spend incl. replacement; ~**$1.48** headroom within $2; next batch smaller (~52 provisions est. after retune) before further authorisation.

## Priority 3 — SEC-DB-003

| Control | Staging API | Staging DB | Local DB |
|---|---|---|---|
| 001 / 002 | **PASS** | — | 5/5 |
| 003 immutability | N/A (no DELETE route) | **BLOCKED** — no local `STAGING_DATABASE_URL` / `SUPABASE_ACCESS_TOKEN` | **PASS** |

## Priority 4 — RI master ×3

- **Stall fix:** watchdog timeouts, suite cap, PG cleanup at master start, Phase 7 **ephemeral port** (avoids fixed `54330` races).
- **Status:** run 1/3 **failed** Phase 7 during concurrent deploy cleanup — **re-run in progress** after fix.

## Priority 5 — Deployment consistency

| Item | Value |
|---|---|
| Commits | `d46e650`, `41d7e52` |
| Staging deployment | `dpl_9emxLFVY7Rj9TQgwcaJWjr35DALA` |
| Build | `npm run build` **PASS** locally |

## Priority 6 — Regulatory accuracy

Claim-level precision/recall **not yet measured**. Benchmark file created; processing coverage **1.0** for PS26/1 supply only. Provider-audited spend **~$0.384**.

## Priority 7 — Production

**NO-GO** — complete PS22 replacement + claim-level accuracy + RI master ×3 + hosted SEC-DB-003.

## Mandatory intervention

1. **Refresh staging UAT sessions** (`staging-user-sessions.mjs login A/B/C`) for PS26 reconcile + PS22 replacement.
2. **Provide `STAGING_DATABASE_URL`** (secure channel) for hosted SEC-DB-003 demonstration.