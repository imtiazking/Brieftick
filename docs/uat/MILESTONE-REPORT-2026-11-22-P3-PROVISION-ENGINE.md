# Milestone — Provision engine & source verification (P3, no paid AI)

**Date:** 2026-11-22  
**Scope:** Staging/local only; no production deploy; no additional paid extractions.

## Executive summary

Targeted paid conversions failed for **fixable, documented reasons**, not unproven OCR loss. The authoritative FCA PS26/1 instrument text for **CONC 7.20.1R(2)** is the *notify borrower after missed payment* duty on PDF **p. 95**, not the legacy UAT string *“contact the customer…”* (that wording **does not appear anywhere** in the official instrument PDF). A **provision page-index bug** also omitted p. 95 from **7.20.1R** when multiple provisions share one page. Both are fixed locally with deterministic acceptance.

PS22/9 **PRIN 2A.4.35E** is present on **p. 126** of the official PDF; the paid run produced **2A.4.34R/36R** findings instead of an E-tagged 35E finding — an **AI coverage/selection outcome**, not missing source text. Next paid attempt requires inventory preflight + narrower batch targeting.

## Root causes

| Area | Root cause | Fix |
|------|------------|-----|
| CONC 7.20.1R(2) conversion | Wrong expected quotation in UAT scripts/docs (Handbook narrative vs FCA 2026/2 insert text) | Updated quotes; `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json` |
| CONC cross-page index | `buildProvisionPagesIndex` skipped leading (2)–(4) on p. 95 when later markers (7.20.2G, 7.20.3R) exist on same page | Page-merged index + same-page lead continuation (`provision-eligibility.mjs`) |
| PS22 E conversion | No finding cited 35E; unrelated p. 126 rules selected as obligations | `E-PROVISION-CONVERSION-TEST-PLAN-2026-11-22.json`; inventory gate before paid retry |
| Classification policy 112/116 | Review validator requires `obligationStatement` grounded in quotation; fixtures used claim text only | Test payloads updated (no weakening of verification) |

## Regression (local)

| Suite | Result |
|-------|--------|
| `acceptance-ri-classification-policy-core.mjs` | **116/116** |
| `acceptance-ri-provision-eligibility-local-db.mjs` | **47/47** |
| `acceptance-ri-provision-source-verification-ps26.mjs` | **7/7** |
| `acceptance-ri-provision-inventory.mjs` | **5/5** |
| `acceptance-ri-publication-extraction-orchestrator.mjs` | **6/6** |
| Prior P2 engine/e2e/batch | unchanged **13/8/5** |

## New capabilities

- **`provision-inventory.mjs`** — deterministic provision inventory + tracking statuses (`identified` → `supplied` → `finding` / `no_obligation` / `unresolved`).
- **Orchestration** — optional `evidenceBlocks` init attaches inventory; reconciliation surfaces unresolved cores in `coverageReconciliation`.
- **Evidence** — `PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json`, `PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json`.

## Readiness for next paid extraction

1. Deploy platform changes to staging (provision index + UAT script quotes).
2. Re-run **deterministic** preflight (`acceptance-ri-provision-source-verification-ps26.mjs` against staging revision hash).
3. CONC: review finding with **instrument-accurate** 7.20.1R(2) quotation on **p. 95** (or cross-page with p. 94).
4. PS22: `targetProvisionCores=2A.4.35E` + confirm inventory marks 35E **supplied** before paying; reject unrelated 34R/36R conversions.
5. FRC: `REG-FRC-SUSPEND-CONVERSION-PROPOSAL-2026-11-22.json` — controlled operator approval (admin writes remain off).

## Production readiness (unchanged gaps)

- Staging deploy of provision-index fix.
- Positive **E** on staging after guided paid retry.
- Multi-regulator verified policies (PRA/ICO/PSR) — drafts only.
- Full publication orchestration live coverage — not claimed.