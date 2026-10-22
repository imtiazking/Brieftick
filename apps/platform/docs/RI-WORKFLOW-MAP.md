# RI workflow implementation map (Phase 4)

| Database entity | Service | Route | Mutation | Authorisation |
| --- | --- | --- | --- | --- |
| `regulatory_publications` (global) | `services/publications.ts` | `/ri/publications`, `/ri/publications/[id]` | — (read); dev seed script only | `ri:read` |
| `organisation_publications` | `services/triage.ts` | publication detail | `updateTriageAction` | `triage:write` (ANALYST+) |
| `applicability_assessments` | `services/applicability.ts` | publication detail | `saveApplicabilityAction` | `applicability:write` |
| `regulatory_changes` | `services/changes.ts` | `/ri/changes`, `/ri/changes/[id]` | `createChangeAction`, `updateChangeStatusAction` | `change:write` |
| `impact_assessments` | `services/impact.ts` | `/ri/impact-assessments/*` | `createImpactAction`, `updateImpactAction` | write/submit/review/approve per action |
| `regulatory_obligations` | `services/obligations.ts` | `/ri/obligations/*` | `createObligationAction`, `updateObligationAction` | `obligation:write` |
| `workflow_events` | `workflow-events.ts` | — | recorded inside services | same as parent mutation |

Global publications are never duplicated per organisation. Organisation workflow state lives in tenant tables with RLS.
