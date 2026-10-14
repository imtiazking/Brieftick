# ADR-013: External source content treated as untrusted data

## Decision
All retrieved regulatory text is tagged `UNTRUSTED_SOURCE_CONTENT` and must not drive configuration, URLs, or AI system instructions.

## Consequences
Future AI pipeline must treat source text as evidence only (prompt-injection defence).
