# Threat model (summary)

| Threat | Component | Mitigation | Residual |
|--------|-----------|------------|----------|
| Cross-tenant access | API, queries | Server tenant from session; row-level tenant_id | Misconfiguration risk |
| Privilege escalation | Commands | Server RBAC + governance authority | Mock in Design Lab |
| Unauthorised approvals | Workflow | Maker/checker, server-side | UI-only if server skipped |
| Audit tampering | Audit store | Append-only DB, hash chain optional | Browser lab not tamper-proof |
| Malicious upload | Evidence ingest | Scan, quarantine, type/size limits | Not in lab |
| Source poisoning | Ingestion | Trust metadata, human review | AI may misread |
| Prompt injection in sources | AI pipeline | Delimited context; deterministic injection scan; source as `UNTRUSTED_SOURCE_CONTENT`; human review | Residual model risk |
| External AI data leakage | AI provider adapter | Tenant policy; data-class rules; server-side calls only | Misconfigured tenant policy |
| Hallucinated citations | AI output | Citation IDs must ∈ context sections; grounding + quality gate | Unsupported claims may persist as flagged |
| Autonomous compliance decision | Workflow | Automation levels 1–2 only; AI cannot approve/close/attest | Policy bypass if server not enforced |
| Provider key exposure | Dev/repo | No keys in Design Lab; credential UI shows Not configured | Human error in production |
| Stolen session | Auth | OIDC, short sessions, MFA at IdP | Phishing |
| Secrets in repo | Dev process | Secret manager, CI scanning | Human error |

Mitigations are **not fully implemented** until production build-out.
