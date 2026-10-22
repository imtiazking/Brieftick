# Relationship authority (production RI)

1. **Explicit FK and join tables are authoritative** for ownership and attribution.
2. **Denormalised mirrors** (graph hints, cached counts) are not authoritative.
3. **Graph traversal** may explain provenance in UI; it must not establish canonical ownership.
4. **Evidence** links only via `evidence_obligation_links`, `evidence_control_links`, `evidence_action_links`.
5. **Findings** link via `finding_obligation_links`, `finding_control_links`, `finding_action_links` — not inferred from sharing a `regulatory_change_id`.
6. **Shared controls** satisfy multiple obligations through `obligation_control_links`; evidence remains per explicit link rows.
