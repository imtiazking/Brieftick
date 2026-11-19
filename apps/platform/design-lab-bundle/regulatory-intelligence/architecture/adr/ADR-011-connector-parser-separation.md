# ADR-011: Connector / parser separation

## Decision
Connectors discover and retrieve; `document-parser.js` normalises HTML/PDF/RSS into sections.

## Consequences
Parser version changes can trigger reprocessing without connector changes.
