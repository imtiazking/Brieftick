# ADR-001: Modular monolith before microservices

## Context
FORGENIQ needs strong consistency across governance, assurance, and audit with manageable operational cost.

## Decision
Ship initial production as a **modular monolith** with clear domain module boundaries.

## Consequences
+ Simpler transactions and deployment; faster iteration.
− Must enforce module boundaries in code reviews; extract services only when justified.

## Alternatives
Microservices from day one — rejected due to operational and transactional complexity.
