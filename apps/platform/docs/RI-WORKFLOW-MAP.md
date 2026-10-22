# RI workflow implementation map (Phase 4–5)

| Database entity | Service | Route | Mutation | Authorisation |
| --- | --- | --- | --- | --- |
| `regulatory_publications` (global) | `services/publications.ts` | `/ri/publications`, `/ri/publications/[id]` | — (read); dev seed script only | `ri:read` |
| `organisation_publications` | `services/triage.ts` | publication detail | `updateTriageAction` | `triage:write` (ANALYST+) |
| `applicability_assessments` | `services/applicability.ts` | publication detail | `saveApplicabilityAction` | `applicability:write` |
| `regulatory_changes` | `services/changes.ts` | `/ri/changes`, `/ri/changes/[id]` | `createChangeAction`, `updateChangeStatusAction` | `change:write` |
| `impact_assessments` | `services/impact.ts` | `/ri/impact-assessments/*` | `createImpactAction`, `updateImpactAction` | write/submit/review/approve per action |
| `regulatory_obligations` | `services/obligations.ts` | `/ri/obligations/*` | `createObligationAction`, `updateObligationAction` | `obligation:write` |
| `workflow_events` | `workflow-events.ts` | — | recorded inside services | same as parent mutation |

| `policies` | `services/policies.ts` | `/ri/policies/*` | `server-actions-downstream.ts` | `policy:write` |
| `risks` | `services/risks.ts` | `/ri/risks/*` | create/update + `links.ts` | `risk:write` |
| `controls` | `services/controls.ts` | `/ri/controls/*` | create/update + risk/obligation links | `control:write` |
| `actions` | `services/ri-actions.ts` | `/ri/actions/*` | create/update; overdue derived in `action-overdue.ts` | `action:write` |
| `evidence_items` | `services/evidence.ts` | `/ri/evidence/*` | metadata only; explicit `evidence_*_links` | `evidence:write` |
| `findings` | `services/findings.ts` | `/ri/findings/*` | explicit control/action links (no implicit obligation) | `finding:write` / `finding:close` |
| `assurance_reviews` | `services/assurance.ts` | `/ri/assurance/*` | `ASSURANCE_COMPLETED` event | `assurance:write` |
| Trace | `services/trace.ts` | `/ri/trace/[obligationId]` | read-only explicit graph | `obligation:read` |

Join mutations use `lib/ri/links.ts` (`assertPair` + workflow events). Evidence on obligations: direct `evidence_obligation_links` vs supporting via shared control (`trace.ts`).

Global publications are never duplicated per organisation. Organisation workflow state lives in tenant tables with RLS.
