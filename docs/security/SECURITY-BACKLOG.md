# FORGENIQ platform — security backlog

Database security is **not complete**. The role-aware RLS migration (`20261120140000_ri_role_aware_rls`, applied to staging 2026-11-20) closes membership-only writes, but the items below remain open. Each one **must be resolved before wider production rollout**.

| ID | Item | Current state | Required outcome | Blocks production |
|---|---|---|---|---|
| SEC-DB-001 | Restrict finding closure to COMPLIANCE_MANAGER at database level | **Addressed (staging)** — migration `20261122233000_ri_security_db_hardening.sql` + `ri_guard_finding_close`. Local acceptance `acceptance-ri-security-db-local-db.mjs`. | Database guard on `CLOSED` transition; staging applied via Supabase MCP 2026-11-22. Production promotion still requires approval. | Yes (promotion) |
| SEC-DB-002 | Prevent impersonation through manual record creator fields | **Addressed (staging)** — `ri_guard_manual_creator_simple` on findings/risks/actions/controls; `ri_guard_manual_change_creator` on manual regulatory changes. Obligations retain existing classified + AI-assisted guards. | Staging applied 2026-11-22; local acceptance partial (creator mismatch + finding close paths). | Yes (promotion) |
| SEC-DB-003 | Strengthen audit immutability against privileged service-account access | **Addressed (staging)** — `ri_guard_workflow_events_immutable` (break-glass `app.audit_maint=authorized`). | Staging applied 2026-11-22; local delete/truncate path verified in acceptance script. | Yes (promotion) |

| SEC-GOV-001 | Platform operator allowlist changes lack append-only audit history | `platform_operators` updates only `updated_at`; no event log for activate/revoke/insert (2026-11-22 staging correction documented in JSON approval record only). | Append-only `platform_operator_events` (or reuse governance workflow_events pattern) with actor, reason, prior status; maker-checker for multi-operator changes; read restricted to platform operators. | No (staging gap) |

Related residuals recorded for review (not blocking staging UAT):

- `tenant_notifications` recipient-update policy unchanged by the role-aware migration.
- Spending cap is enforced pre-flight in the application per request (`RI_LAB_ANTHROPIC_MAX_USD`), not by provider billing.

Change control: each item ships as its own migration with a rollback file, an isolated-database acceptance test, a pre-apply backup/recovery point and explicit approval before staging application.
