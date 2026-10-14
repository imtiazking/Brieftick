# ADR-012: Live verification disabled by default

## Decision
`allowLiveRegulatoryVerification` defaults to `false`; no automatic polling on startup.

## Consequences
Demos remain deterministic; operators must explicitly enable local live checks.
