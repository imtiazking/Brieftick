# ADR-006: Queue and background workers

## Decision
Async ingestion, AI, and notifications via queue + workers with idempotency.

## Consequences
+ Resilience and scale for heavy work.
− Operational complexity (DLQ, monitoring).

## Alternatives
Synchronous API-only — rejected for ingestion/AI latency.
