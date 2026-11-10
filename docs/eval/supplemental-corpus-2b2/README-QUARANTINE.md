# Supplemental corpus quarantine (Phase 2B.2 Step C/D)

This directory contains **non-authoritative** offline retrieval distractors.

- **Catalogue metadata** (`catalogue.json`) reflects real staging `regulatory_publications` rows (IDs, titles, URLs).
- **Pack body text** (`*-catalogue-excerpt-v1.json`) uses regression HTML fixtures and manually authored abstracts — **not** canonical FCA extractions.

## Do not use for

- Production or staging regulatory evidence indexing
- Retrieval evaluation claiming FCA source authenticity
- Ask RI answers presented as authoritative regulatory citations

## Authoritative offline eval corpus

Use only `docs/eval/evidence-packs/` (three publications with full `regulatory_source_extraction_revisions`).

See `docs/eval/phase-2b2-step-d-supplemental-provenance-audit.json`.
