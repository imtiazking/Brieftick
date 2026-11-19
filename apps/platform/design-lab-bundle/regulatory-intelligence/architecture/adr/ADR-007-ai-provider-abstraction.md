# ADR-007: Provider-neutral AI service

## Decision
AI Analysis Service behind `AIProvider` abstraction; governance records vendor-agnostic.

## Consequences
+ Model upgrades without domain rewrite; grounding and human review enforced.
− Provider adapter maintenance.

## Alternatives
Direct vendor SDK in domain — rejected.
