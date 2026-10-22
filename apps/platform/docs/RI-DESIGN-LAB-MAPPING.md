# Design Lab → production RI mapping

| Design Lab concept | Production table(s) | Notes |
|--------------------|---------------------|-------|
| Regulator catalogue | `regulators` | Global; `external_key` = `REG-*` |
| Source catalogue | `regulatory_sources` | Global; `external_key` = `SRC-*`; `production_status` NOT_ENABLED |
| Publication / raw source item | `regulatory_publications` | Global authoritative document |
| Org triage on publication | `organisation_publications` | Per-tenant materiality/triage |
| Applicability | `applicability_assessments` | Human/AI-distinguishable `recommendation` |
| Change | `regulatory_changes` | 1 publication → N changes |
| Impact assessment | `impact_assessments` | Scoped impacts + JSON scope arrays |
| Obligation | `regulatory_obligations` | Explicit `obligation_status` enum |
| Policy | `policies` + `obligation_policy_links` | M2M, not arrays |
| Risk | `risks` + `obligation_risk_links` | M2M |
| Control | `controls` + link tables | Shared controls explicit |
| Action | `actions` + optional source FKs | No graph-only ownership |
| Evidence | `evidence_items` + link tables | Explicit attribution only |
| Finding | `findings` + `finding_*_links` | No obligation via shared change alone |
| Assurance | `assurance_reviews` + subject link tables | No unsafe polymorphic FK |
| Workflow / audit | `workflow_events` | Lightweight, not event sourcing |
| Denormalised graph edges | — | **Not authoritative** in production |
