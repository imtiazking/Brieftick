# Security architecture (production target)

## Authentication

- Enterprise **OIDC / OAuth2** (e.g. Entra ID, Okta)
- Session established server-side; frontend receives session context from API

## Authorisation

- **Deny by default**
- Server enforces permissions on every command
- Resource-level checks: tenant, ownership, materiality, governance authority

## Distinction

| Concept | Example |
|---------|---------|
| Governance role | Head of Regulatory Change (workflow) |
| Application role | Regulatory Change Approver (permission bundle) |

## Data protection

- TLS in transit (production)
- Encryption at rest: DB, object storage, backups
- Secrets in secret manager — never in JS bundles or Git

## Application security

CSRF (where cookie sessions), secure cookies, CSP, input validation, output encoding, rate limiting, secure headers, session timeout.

## AI runtime

- **No provider credentials in browser** — frontend calls FORGENIQ API only; production provider secrets live in server secret manager.
- **Tenant AI policy** (`allowExternalAI`, budgets) enforced before external execution.
- **Data handling classes** per use case; confidential evidence not sent externally by default.
- **Audit** records execution metadata, not full prompts or secrets.
- **Output treated as untrusted** until schema, citation, and quality gates pass; escape on render.

## Content Security Policy (production target)

Recommended headers documented for production static/API hosting: strict CSP, `frame-ancestors`, `X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy. **Not enforced** on local Design Lab static server.

## Design Lab

`can()` / `assertPermission()` provide **MOCK AUTHORISATION** only. Not production secure. Default `aiExecutionMode: fixture`; external AI disabled. User/source text rendered via `esc()`; unsafe link schemes blocked in `safe-link.js`.
