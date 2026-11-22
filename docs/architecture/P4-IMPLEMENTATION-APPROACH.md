# Priority 4 — implementation approach (reuse existing architecture)

## Principles

- Extend `regulatory_classification_policies`, `ri_submit_ai_finding_review`, `build-pdf-grounded-analysis-context`, and Design Lab connected panels — no parallel obligation register or duplicate write paths.
- Maker-checker stays on existing RPCs (`ri_propose_classification_policy`, `ri_activate_classification_policy`, obligation status transitions).
- Paid extraction remains idempotent, budgeted, human-reviewed; multi-batch work extends UC-RI-005 rather than replacing it.

## RI-CLS-003 — Classification policy administration UI

- **Read path:** existing `GET /api/ri-lab/classification-policy` + panel in `connected-ai-governance-panels.js`.
- **Write path:** new connected admin section calling existing RPCs only (`ri_propose_classification_policy`, `ri_activate_classification_policy`) with platform-operator role checks mirrored from `classification-policy-admin.ts`.
- **Verification:** extend `acceptance-ri-classification-policy-admin-local-db.mjs`; authenticated UAT as two distinct operators.

## RI-CLS-001 — FRC / ICO / PSR / PRA policies

- Seed regulator metadata already in `regulators` table; draft per-regulator `regulatory_classification_policy_entries` from authoritative code lists (separate SME review packs — not invented in engineering).
- Activation through policy admin RPCs; fail-closed until `ACTIVE` (already enforced).
- **Verification:** one manual obligation create attempt per regulator in browser (expect `classification_policy_unavailable` until active).

## RI-CLS-007 — Multi-batch extraction

- **Orchestration:** extend `ai-analysis` service with a publication-level batch plan stored on `regulatory_publications` or change metadata (sections per batch, cumulative coverage, outstanding provision cores).
- **Execution:** each batch = separate idempotent paid run (new suffix), reusing `build-pdf-grounded-analysis-context` + existing review/materialisation; dedupe by `provisionReference` + normalised statement hash in a new view or materialisation guard.
- **UI:** coverage widget on AI run detail (already has `selection`); add cumulative ledger on change/publication.
- **No auto-retry;** user-approved batch count caps cost.

## Coverage and deduplication

- Reuse `provisionPageIndex` / `instrumentProvisionsOmitted` from grounding payload; persist cumulative union on parent change record.
- Deduplication query before insert: `regulatory_obligations` same org + provision core + quotation hash + change.

## Sequencing

1. Ship RI-UI-007 / RI-CLS-009 / workflow defects (this sprint).
2. Policy admin UI + FRC policy pack (SME-gated).
3. Multi-batch plan + first two-batch pilot on PS26/1 or PS22/9 (paid cap 2 on staging).