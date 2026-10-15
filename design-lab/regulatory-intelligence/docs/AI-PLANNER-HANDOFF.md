# Ask RI — AI planner handoff (Design Lab → Production Engineering)

This document describes the **current deterministic grammar planner** in Design Lab. Production Engineering should replace broad natural-language understanding with an AI planner that emits the same validated plan schema and respects the same honesty rules.

## Plan schema (`buildAskQueryPlan` / `parsed.plan`)

| Field | Purpose |
|--------|---------|
| `query` | Original question text |
| `resolvedEntities` | Catalogue-resolved hubs: `Sector`, `Regulator`, `Framework`, `Theme` (`type`, `id`, `label`, optional `slug`) |
| `primaryTargetType` | Graph primary node: `Change`, `Obligation`, `Action`, `Control`, `Evidence`, `Assurance` |
| `targetPredicate` | Optional predicate plan (`targetType`, anchors, `requiredRelationships`, `excludedRelationships`, …) |
| `anchorIntersection` | `true` when multi-hub AND semantics apply |
| `anchorLogic` | `AND` (default) |
| `secondaryTargetTypes` | From relationship pattern detection |
| `relationshipRequests` | `{ id, from, to }` edges requested in language |
| `statusFilters` | e.g. `open`, `overdue`, `current`, `horizon` with `appliesTo` types |
| `temporalFilters` | `current`, `horizon` |
| `secondaryIntents` | `linked-actions`, `linked-obligations`, `linked-assessments`, `linked-risks`, `linked-controls` |
| `requireLinkedTo` | e.g. `Action` when “have linked actions” |
| `aggregationRequests` | e.g. `count-open-obligations` |
| `compound` | Compound graph query (secondary relationships + primary Change or status on obligations) |
| `evidenceDisplayCap` | UI cap (12) |
| `unresolvedSemantics` | When set, planner declines to build a safe plan (e.g. due-soon, policy-primary) |

Retrieval `filters.intent`: `graph-query`, `target-predicate`, `count-open-obligations`, `reviewed-cross-source`, `regulator-sector-evidence`, or absent → `UNRESOLVED_QUERY_SEMANTICS`.

## Supported primary targets (honest)

| Target | Graph-primary | Predicate-primary |
|--------|---------------|-------------------|
| **Change** | Yes | Yes |
| **Obligation** | Yes | Yes |
| **Action** | Yes | Limited |
| **Control** | Yes | Limited |
| **Policy** | **No** — policy-led questions → `unresolvedSemantics` |
| **Risk** | Secondary only | Not as primary |
| **Evidence** | Secondary / predicate | Predicate paths only |

## Supported relations (execution)

Route B executor uses **canonical FK helpers** (`ri-canonical-links.js`), not `change.linked*`. Secondary expansion runs only when `secondaryIntents` or `relationshipRequests` / `requireLinkedTo` request it.

`evaluatedCounts` / `evaluatedRelations` on graph results: relationship counts in answers must only reference types with `evaluated: true`.

## Filters / parameters

| Filter | Implemented |
|--------|-------------|
| Open / overdue obligations & actions | Yes (status filters) |
| Currently relevant changes | Yes (`current` temporal) |
| Horizon / future-facing | Yes |
| **Due soon / due within N days** | **No** → `UNRESOLVED_QUERY_SEMANTICS` |
| Cardinality (“more than one control”) | No |
| Policy-vs-control predicates | No |

## Result states (end-to-end)

| State | Meaning | Provider calls |
|--------|---------|----------------|
| `RESOLVED` | Safe plan + qualifying records | Allowed when synthesis needed |
| `ZERO_QUALIFIERS` | Safe plan + known scope + zero matches | **0** |
| `INSUFFICIENT_EVIDENCE` | Named entity/domain not in verified catalogue | **0** |
| `UNRESOLVED_QUERY_SEMANTICS` | Grammar cannot interpret structure | **0** |
| `AMBIGUOUS_QUERY` | **Deferred** — not implemented |

UI: `ask-ri-ui.js` renders unresolved, insufficient, zero-qualifiers, and resolved paths separately. `interpretedAs` from `ri-interpreted-as.js` (no AI object required).

## Relationship registry status

`ri-relationship-registry.js` defines `RI_RELATIONS` and `getRelation()`. **Not authoritative today:** planner/executor do not resolve edges exclusively through the registry. `finding_via_sourced_action` is documented as a derived attribution edge. Production should either wire the registry through execution or treat it as documentation-only.

## Known limitations (by design in Design Lab)

- No arbitrary English; honest `UNRESOLVED` is expected for unsupported structures.
- No policy-primary graph queries.
- No due-soon parameterisation.
- TPR hub: seed has **no** `Change` rows linked to TPR via `publication.regulator` / `regulatorIds` (TPR lives in landscape/TPR records); “TPR-related changes” correctly yields **zero qualifiers** until data is linked.
- Compound answers must not emit unevaluated zero counts (`ai-006-compound-ask` uses `evaluatedCounts`).

## Honest 12-question evaluation (verbatim set)

| ID | Result | State |
|----|--------|--------|
| Q01 | HONEST MISS | UNRESOLVED |
| Q02 | PASS | RESOLVED |
| Q03 | **PASS** | ZERO_QUALIFIERS (independent raw TPR-linked Change IDs: `[]`) |
| Q04 | HONEST MISS | UNRESOLVED |
| Q05 | PASS | RESOLVED |
| Q06 | HONEST MISS | UNRESOLVED |
| Q07 | HONEST MISS | UNRESOLVED |
| Q08 | HONEST MISS | UNRESOLVED |
| Q09 | HONEST MISS | UNRESOLVED |
| Q10 | HONEST MISS | UNRESOLVED |
| Q11 | HONEST MISS | UNRESOLVED |
| Q12 | HONEST MISS | UNRESOLVED |

**Answered correctly:** 3 / 12 · **Honest misses:** 9 / 12 · **Failures:** 0 / 12  

Independent expectations: `scripts/lib/ri-eval-independent.mjs` (raw FK only). Runner: `scripts/acceptance-ask-ri-eval.mjs`.

### Q03 independent expectation (raw fields)

`expectedTprLinkedChangeIds(state)` returns Change IDs where any of:

- `change.regulatorIds` contains `REG-TPR`
- `change.regulator` mentions TPR/pension
- `publications[change.publicationId].regulator` matches TPR short name or “tpr”

**Current seed result:** `[]` → `ZERO_QUALIFIERS` is correct.

## Evidence confidence (current — to be redesigned)

Today `scoreEvidenceConfidence` in `evidence-confidence.js` runs on **fixture AI output** (`keyFindings` + citations vs context), not on retrieval strength alone. Ask RI RESOLVED path sets UI confidence from persisted analysis (HIGH/MEDIUM/LOW). Missing analysis confidence shows **NOT ASSESSED** in UI.

**Production direction:** derive confidence from retrieval coverage, citation grounding, and predicate completeness—not fixture echo alone.

## Entity constraints (catalogue-driven)

- `-related` suffix stripped before resolution (e.g. TPR-related → TPR).
- Unresolved `in/under/from` phrases block when not in catalogue.
- Unknown sector slugs (`… sector`, long `… regulatory` lead-in).
- All-caps acronyms in “what does X require” / “require” context if not in catalogue.
- Mixed-case authority tokens (internal capitals) in regulatory context if not in catalogue.
- Nationality adjective “German” only when no matching jurisdiction in catalogue.

## Default synthesis scenario

`ai-006-deterministic-ask` builds answers from retrieval records only (no Banking narrative). `ai-006-compound-ask` only when `filters.compound` is true.
