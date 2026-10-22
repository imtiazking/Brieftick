# RI Design Lab → Production parity matrix

**Frozen lab:** `d46ca1b` / `ri-design-lab-freeze` (`#/dashboard` reference)  
**Production workspace:** `app.forgeniq.com/ri` (`apps/platform`)  
**Phase 7B baseline:** experience parity (no runtime dependency on Design Lab)

## Summary counts

| Status | Count |
| --- | ---: |
| Features inventoried | **52** |
| PRODUCTION_COMPLETE | **19** |
| BACKEND_COMPLETE_UI_MISSING | **11** |
| PARTIAL | **9** |
| WAIT_FOR_AI | **8** |
| WAIT_FOR_ASK_RI | **1** |
| DESIGN_LAB_ONLY | **4** |

## Traceability legend

| Status | Meaning |
| --- | --- |
| PRODUCTION_COMPLETE | Production route + services + UX aligned with lab intent |
| BACKEND_COMPLETE_UI_MISSING | Schema/services exist; lab-grade UI depth not yet rebuilt |
| PARTIAL | Some production capability; gaps listed |
| WAIT_FOR_AI | Requires Phase 8+ AI |
| WAIT_FOR_ASK_RI | Requires production Ask RI |
| DESIGN_LAB_ONLY | Demo/lab-only; not ported |

---

## Core workspace

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `#/dashboard` | `/ri` | `dashboard.ts` | PRODUCTION_COMPLETE | Metrics from DB; gold metric grid |
| Horizon scanning | `#/horizon` | `/ri/horizon` | `horizon.ts`, publications | PRODUCTION_COMPLETE | Add content-class filter when ingested |
| Regulatory calendar | `#/calendar` | `/ri/calendar` | `calendar.ts` | PRODUCTION_COMPLETE | Month grid view FUTURE |
| Work queue | `#/work-queue` | `/ri/work-queue` | `work-queue.ts` | PRODUCTION_COMPLETE | Team scope = all assignable items |
| My team | work queue personas | `/ri/work-queue?scope=team` | memberships | PARTIAL | No team hierarchy model yet |
| Notifications | `#/notifications` | — | workflow_events | BACKEND_COMPLETE_UI_MISSING | In-app notification centre FUTURE |
| Intake | `#/intake` | publications triage | organisation_publications | PARTIAL | Dedicated intake list FUTURE |

## Publications & ingestion

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Publications list | `#/library` / feed | `/ri/publications` | `publications.ts` | PRODUCTION_COMPLETE | Empty states |
| Publication detail | `#/publication/*` tabs | `/ri/publications/[id]` | publications + triage | PARTIAL | Impact tab per change; version list UI |
| AI summary tab | publication AI | `#ai` placeholder | — | WAIT_FOR_AI | Phase 8 |
| Source provenance | ingestion views | detail Source section | ingest + versions | PRODUCTION_COMPLETE | Show version table on detail |
| Ingestion monitor | `#/ingestion` | `/ri/admin/ingestion` | Phase 6–7 | PRODUCTION_COMPLETE | Role-gated |
| Source admin | `#/ingestion` sources | `/ri/admin/sources` | ingestion-admin | PRODUCTION_COMPLETE | NOT_ENABLED banner |
| Alerts | lab ops | `/ri/admin/alerts` | operational_alerts | PRODUCTION_COMPLETE | |

## Lifecycle

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Changes register | `#/changes` | `/ri/changes` | `changes.ts` | PARTIAL | Richer columns (owner, deadlines) |
| Change detail | `#/change/*` | `/ri/changes/[id]` | changes | BACKEND_COMPLETE_UI_MISSING | Lab layout parity |
| Impact assessments | `#/assessments` | `/ri/impact-assessments` | impacts service | PARTIAL | Category panels on detail |
| Obligations | `#/obligations` | `/ri/obligations` | obligations | PARTIAL | Priority/owner columns on list |
| Obligation detail | `#/obligation/*` | `/ri/obligations/[id]` + trace | trace.ts | PRODUCTION_COMPLETE | Explicit link ownership |
| Policies | `#/policies` | `/ri/policies` | policies | BACKEND_COMPLETE_UI_MISSING | Version/review UI |
| Risks | `#/risks` | `/ri/risks` | risks | BACKEND_COMPLETE_UI_MISSING | Inherent/residual display |
| Controls | `#/controls` | `/ri/controls` | controls | BACKEND_COMPLETE_UI_MISSING | Effectiveness/testing panels |
| Actions | `#/actions` | `/ri/actions` | ri-actions | PARTIAL | Overdue badge on list |
| Evidence | `#/evidence` | `/ri/evidence` | evidence | PARTIAL | Direct vs supporting labels on list |
| Findings | `#/finding` | `/ri/findings` | findings | BACKEND_COMPLETE_UI_MISSING | Severity/remediation layout |
| Assurance | `#/assurance` | `/ri/assurance` | assurance | BACKEND_COMPLETE_UI_MISSING | Review subject panels |
| Trace | lab trace | `/ri/trace/[obligationId]` | trace | PRODUCTION_COMPLETE | |

## Governance & reporting

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Governance register | `#/governance` | `/ri/governance` | workflow_events | PARTIAL | Committee/attestation FUTURE |
| Approvals | `#/approval` | impact approve actions | server-actions | PARTIAL | Unified approval inbox FUTURE |
| Management reporting | `#/reports` | `/ri/reporting` | `reporting.ts` | PRODUCTION_COMPLETE | No AI board narrative |
| Board pack | `#/board-pack` | — | — | DESIGN_LAB_ONLY | FUTURE export |
| Executive reports | `#/reports/executive` | `/ri/reporting` | dashboard aggregates | PARTIAL | Extended assurance reports FUTURE |
| SLA / notifications | lab SLA | — | — | DESIGN_LAB_ONLY | FUTURE ops |

## Landscape & legacy sources

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Regulatory landscape | `#/landscape` | — | catalogue | DESIGN_LAB_ONLY | Sector matrix FUTURE |
| Legislation staging | `#/legislation` | connectors | SRC-UK-LEGISLATION-ATOM | PARTIAL | Ingestion not enabled |
| TPR staging | `#/tpr` | connectors | SRC-TPR-DOCUMENT-LIBRARY | PARTIAL | Manifest mapped |
| Basel staging | `#/basel` | connectors | SRC-BASEL-FRAMEWORK | PARTIAL | Manifest mapped |
| FCA / PRA / HMT | live-verification | `core-legacy-connectors.mjs` | integrations | PRODUCTION_COMPLETE | Connectors; NOT_ENABLED |

## AI & Ask RI

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Ask RI | `#/ask-ri` | nav disabled | — | WAIT_FOR_ASK_RI | Future phase |
| AI analysis | `#/ai-analysis` | — | — | WAIT_FOR_AI | |
| AI governance | `#/ai-governance` | `/ri/ai-governance` placeholder | — | WAIT_FOR_AI | Phase 8 foundation |
| AI operations | `#/ai-operations` | `/ri/ai-operations` placeholder | — | WAIT_FOR_AI | |
| AI execution | `#/ai-execution` | — | — | WAIT_FOR_AI | |
| AI model/use-case | `#/ai-model` | — | — | WAIT_FOR_AI | |
| AI oversight report | reports/ai-oversight | — | — | WAIT_FOR_AI | |
| Applicability AI | lab panels | human-only forms | applicability | WAIT_FOR_AI | Human authoritative today |

## Admin & demo

| Capability | Design Lab | Production | Backend | Status | Gap / action |
| --- | --- | --- | --- | --- | --- |
| Demo journey | `#/demo` | — | — | DESIGN_LAB_ONLY | Not in production |
| Platform admin | `#/admin` | Clerk/platform | — | DESIGN_LAB_ONLY | Separate product admin |
| Audit log view | `#/audit` | workflow_events | workflow_events | BACKEND_COMPLETE_UI_MISSING | Read-only audit UI FUTURE |

---

## Core legacy source mapping (production integrations)

| Family | SRC-ID | Production connector | Lab artefact | production_status |
| --- | --- | --- | --- | --- |
| FCA | SRC-FCA-PUBLICATIONS-RSS | CONN-LEGACY-FCA | live-verification-evidence | NOT_ENABLED |
| PRA / BoE | SRC-PRA-PUBLICATIONS | CONN-LEGACY-PRA | live-verification-evidence | NOT_ENABLED |
| HM Treasury | SRC-HMT-PUBLICATIONS | CONN-LEGACY-HMT | live-verification-evidence | NOT_ENABLED |
| UK Legislation | SRC-UK-LEGISLATION-ATOM | CONN-LEGACY-UK-LEG | legislation-verification-evidence | NOT_ENABLED |
| TPR | SRC-TPR-DOCUMENT-LIBRARY | CONN-LEGACY-TPR | tpr-verification-evidence | NOT_ENABLED |
| Basel / BIS | SRC-BASEL-FRAMEWORK | CONN-LEGACY-BASEL | basel-verification-evidence | NOT_ENABLED |

Tracked manifest: `integrations/regulatory-sources/manifests/core-legacy-design-lab-parity.json`

Semantic coverage: `packages/reference-data/catalogue/source-coverage.mjs` (Phase 7B entries).

---

## Design Lab route inventory (52)

Router `KNOWN_TOP_LEVEL` + nested views audited: dashboard, demo, ingestion, governance, ai-governance, ai-operations, ai-execution, ai-analysis, ai-model, ai-use-case, ai-config, assurance, intake, work, work-queue, notifications, feed, horizon, library, publication, changes, version, applicability, assessments, assessment, obligations, obligation, risks, risk, controls, control, policies, policy, actions, action, evidence, calendar, reports, board, audit, admin, approval, attestation, exception, control-test, finding, management-attestation, assurance-pack, board-pack, source-document, landscape, legislation, tpr, basel, ask-ri.
