# ADR-005: Append-only audit

## Decision
Audit events are append-only with optional hash chaining.

## Consequences
+ Tamper-evidence; regulatory defensibility.
− Storage growth; retention policies required.

## Alternatives
Mutable audit log — rejected.
