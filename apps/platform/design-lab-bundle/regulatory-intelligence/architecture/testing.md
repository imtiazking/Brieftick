# Testing strategy

- Unit: domain rules, permissions (mock), helpers
- Service: LocalAdapter, tenant isolation, commands
- API contract: OpenAPI structure validation
- Integration: DB + storage (future)
- E2E: existing `acceptance-*.mjs` suites
- Security: tenant isolation, authorisation denial tests
- Migration: schema upgrades v1→v8
