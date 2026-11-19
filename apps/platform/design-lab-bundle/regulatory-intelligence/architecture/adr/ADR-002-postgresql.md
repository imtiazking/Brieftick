# ADR-002: PostgreSQL primary transactional store

## Context
Regulatory traceability and workflow require relational integrity.

## Decision
Use PostgreSQL with UUID/ULID PKs and business references separate.

## Consequences
+ Mature ecosystem; JSONB for flexible metadata.
− Requires migration discipline and DBA practices at scale.

## Alternatives
Document DB only — rejected for workflow/audit consistency.
