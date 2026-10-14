# Immutable audit architecture

## Principle

Production audit events are **append-only**. Application users cannot edit or delete audit history.

## Event fields (production)

- `event_id`, `tenant_id`, `timestamp`
- `actor_id`, `actor_type` (user | system | integration)
- `action`, `entity_type`, `entity_id`
- `before` / `after` metadata (where appropriate)
- `reason`, `correlation_id`, `request_id`
- `source`, `system_version`

## Integrity (optional)

Hash chaining (`previous_event_hash`, `event_hash`) for tamper-evidence — not blockchain.

## Retention

Policy-driven per tenant/contract; do not hardcode legal periods in code.

## Design Lab

`addAudit()` appends to `auditEvents` with `tenantId`, `correlationId`, `immutable: true`. Still **mock** — browser storage is not tamper-proof.
