# Non-functional requirements

Distinction: **Design Lab** = current static demo. **Production target** = future hosted platform (configurable targets, not contractual SLAs).

## Availability

| | Design Lab | Production target |
|---|------------|-------------------|
| Uptime | Best-effort local | Configurable HA (multi-instance) |
| Degraded mode | Fixture/local data when connectors/AI unavailable | Core workflow without optional integrations |

## Reliability

| | Design Lab | Production target |
|---|------------|-------------------|
| Error boundaries | View-level fallback | API + UI boundaries |
| Idempotent commands | Selected mutations | Server-enforced idempotency keys |

## Performance

| | Design Lab | Production target |
|---|------------|-------------------|
| Route render | &lt; 2s typical on dev machine (see `performance.md`) | API p95 budgets TBD |
| Large lists | Synthetic fixture ~400 changes | Pagination + server queries |

## Scalability

Design Lab: single browser tab. Production: horizontal API/workers, partitioned tenants.

## Security

Design Lab: mock RBAC, escaped output, URL safety, no secrets in JS. Production: OIDC, server RBAC, CSP, secret manager.

## Accessibility

WCAG-oriented functional baseline (keyboard, focus, labels, non-colour-only status). Full audit after Visual Refinement.

## Auditability

Append-only audit simulation; correlation IDs on representative flows.

## Recoverability

Corrupt localStorage → safe baseline; Reset → deterministic seed v10.

## Maintainability

Technical debt register; feature inventory; ADRs.

## Observability

Lightweight telemetry categories; health model; no sensitive payloads in logs.

## Data integrity

Validation script; transition guards; referential checks.

## Browser support

Modern evergreen Chromium baseline; see `browser-support.md`.

## Integration resilience

Connector/AI failures isolated; bounded retries documented.
