# ADR-003: Object storage for documents

## Decision
Store binaries in object storage; metadata in PostgreSQL.

## Consequences
+ Scalable evidence and source archives; signed URLs for access.
− Additional component to secure and monitor.

## Alternatives
BLOB in database — rejected for cost and delivery patterns.
