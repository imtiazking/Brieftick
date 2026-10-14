# ADR-018: Fixture-first AI testing

**Decision:** Default `aiExecutionMode: fixture`; acceptance tests do not call external AI.

**Consequences:** Deterministic CI. Live verification optional and manual.
