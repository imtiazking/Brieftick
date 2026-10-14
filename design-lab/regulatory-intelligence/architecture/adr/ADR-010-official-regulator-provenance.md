# ADR-010: Official regulator sources as primary provenance

## Decision
FCA and PRA ingestion use official `fca.org.uk` and `bankofengland.co.uk` endpoints only, with trust from source configuration.

## Consequences
Secondary blogs/uploads are not primary ingestion targets without explicit trust class.
