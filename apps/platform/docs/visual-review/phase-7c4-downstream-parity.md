# Phase 7C.4 — Downstream assurance visual parity

**Date:** 2026-10-23  
**Design Lab:** `#/policies`, `#/risks`, `#/controls`, `#/actions`, `#/evidence`, findings, assurance, obligation trace  
**Production:** `/ri/policies`, `/ri/risks`, `/ri/controls`, `/ri/actions`, `/ri/evidence`, `/ri/findings`, `/ri/assurance`, `/ri/trace/[obligationId]`

| Screen | Classification | Notes |
| --- | --- | --- |
| Policies list/detail | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Clerk shell; explicit obligation links |
| Risks list/detail | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Same |
| Controls list/detail | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Shared-control context preserved |
| Actions list/detail | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Derived overdue column |
| Evidence list/detail | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Direct obligation links labelled |
| Findings | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Control-linked findings on obligation/trace |
| Assurance | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Human review records |
| Trace view | MATCH_WITH_INTENTIONAL_PRODUCTION_DIFFERENCE | Direct vs supporting evidence separated |

Deterministic parity: `scripts/acceptance-phase-7c4-golden-master.mjs`.
