# ADR-009: Fixture-first regulatory connector testing

## Context
Regulator sites are external, rate-limited, and structurally volatile.

## Decision
All automated tests use **fixture mode**; live verification is opt-in and manual.

## Consequences
- Reliable CI without network dependency
- Live behaviour verified separately

## Alternatives
Live-only tests (rejected — flaky and impolite to regulators).
