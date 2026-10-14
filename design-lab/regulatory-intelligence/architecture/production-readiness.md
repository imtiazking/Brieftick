# Production readiness register (honest status)

**PRODUCTION DEPLOYABLE: NO** — Design Lab only (LocalAdapter, localStorage, mock RBAC, fixture AI).

## Classification key

| Label | Meaning |
|-------|---------|
| Ready for Design Lab | Usable for demos and deterministic acceptance |
| Architecture Defined | Documented target, not fully built |
| Prototype Implemented | Working mock in `design-lab/` |
| Requires Production Implementation | Needs real infra/services |
| Blocking Production | Must be resolved before any prod launch |
| Non-Blocking Production Enhancement | Can follow initial launch |

## Summary

| Area | Classification |
|------|----------------|
| Core Regulatory Intelligence UI | Ready for Design Lab |
| LocalAdapter | Prototype Implemented |
| ApiAdapter | Architecture Defined |
| PostgreSQL / real DB | Requires Production Implementation · **Blocking** |
| OIDC / production identity | Requires Production Implementation · **Blocking** |
| Server RBAC | Requires Production Implementation · **Blocking** |
| Tenant isolation (real) | Requires Production Implementation · **Blocking** |
| Append-only audit (prod) | Architecture Defined · **Blocking** |
| Queue/workers | Architecture Defined |
| Error boundary / route resilience | Prototype Implemented |
| Migration v1→v10 | Prototype Implemented |
| Corrupt storage recovery | Prototype Implemented |
| Performance instrumentation | Prototype Implemented |
| Accessibility (functional) | Prototype Implemented · full pass after Visual Refinement |
| Regulatory connectors (fixture) | Prototype Implemented |
| FCA/PRA live verification | **PASS** (master run 2026-10-09) — Design Lab evidence snapshot only |
| AI provider abstraction | Prototype Implemented |
| Fixture AI | Ready for Design Lab |
| External AI | Not Configured |
| Production secrets | Not Implemented · **Blocking** |
| CSP / secure headers (active) | Architecture Defined |
| Observability (prod) | Requires Production Implementation |

## Release gate (Design Lab)

See `architecture/runbooks/design-lab-recovery.md`. Critical regressions must pass before demo sign-off. Live FCA/PRA re-verification is **not** a gate for this phase.

Do not label mock controls as Production Ready.
