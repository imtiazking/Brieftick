# FORGENIQ Regulatory Intelligence — Target Production Architecture

## Overview

```
Browser / Frontend
  → API Gateway / Application API (/v1)
  → Authentication + Tenant Context (OIDC session)
  → Application Services (commands & queries)
  → Domain Modules (modular monolith)
  → PostgreSQL (transactional)
  → Object Storage (documents / evidence binaries)
  → Queue + Background Workers
  → Regulatory Ingestion Service (module/worker)
  → AI Analysis Service (provider-neutral)
  → Workflow / Governance Services
  → Assurance Services
  → Audit Service (append-only)
  → Reporting / Read Models
  → Observability (logs, metrics, traces)
```

## Frontend responsibilities

- Rendering, routing, forms, presentation state
- Calling authenticated APIs
- **Not** a security boundary — permissions in UI are usability only

## Application API responsibilities

- Tenant resolution from session (never trust client-supplied tenant alone)
- Authorisation, validation, versioning (`/v1`)
- Commands (mutations) and queries (reads)
- Idempotency keys for ingestion and async jobs
- Standard error model (see `api/openapi.yaml`)

## Domain modules (logical)

Regulatory Sources · Ingestion · Publications · Regulatory Changes · Assessments · Obligations · Controls · Actions · Evidence · Governance · AI Governance · Assurance · Reporting · Audit · Notifications

Initial recommendation: **one deployable modular monolith** with strict module boundaries. Ingestion and AI may become separate services later under load.

## Design Lab mapping

```
Frontend → platform-service.js → LocalPlatformAdapter → store.js → platform-persistence.js → localStorage
```

Future: `ApiPlatformAdapter` → HTTPS `/v1` API.

See ADR-001 and ADR-008.
