# FORGENIQ platform — security backlog

Database security is **not complete**. The role-aware RLS migration (`20261120140000_ri_role_aware_rls`, applied to staging 2026-11-20) closes membership-only writes, but the items below remain open. Each one **must be resolved before wider production rollout**.

| ID | Item | Current state | Required outcome | Blocks production |
|---|---|---|---|---|
| SEC-DB-001 | Restrict finding closure to COMPLIANCE_MANAGER at database level | `finding:close` is enforced by the application only. Under RLS an ANALYST can update a finding's status (including closing it) through the Supabase API. | A database guard rejects any transition to a closed finding status unless the caller holds COMPLIANCE_MANAGER or above in the finding's organisation; ANALYST edits otherwise unchanged. Isolated-DB acceptance test plus staging verification. | Yes |
| SEC-DB-002 | Prevent impersonation through manual record creator fields | `created_by_user_id` (and similar creator/owner attribution on manual changes, obligations, risks, controls, evidence, findings, actions) is client-supplied and not bound to the caller. AI-assisted records are already bound. Since `20261121180000`, classified manual obligations are also bound (creator set from the caller, immutable afterwards); other manual record types remain open. | On insert, creator fields are set from (or must equal) the authenticated Clerk user; they are immutable afterwards. Service-role/ingestion writes documented as the only exception. | Yes |
| SEC-DB-003 | Strengthen audit immutability against privileged service-account access | `workflow_events` is append-only for API roles (no UPDATE/DELETE policy; TRUNCATE revoked), but `service_role` and database owners bypass RLS and can modify or delete audit rows. | Trigger-level immutability for UPDATE/DELETE/TRUNCATE on `workflow_events` (and other audit tables) that applies to `service_role`, with a controlled, logged break-glass procedure; optional hash-chaining or off-database export of audit events for tamper evidence. | Yes |

Related residuals recorded for review (not blocking staging UAT):

- `tenant_notifications` recipient-update policy unchanged by the role-aware migration.
- Spending cap is enforced pre-flight in the application per request (`RI_LAB_ANTHROPIC_MAX_USD`), not by provider billing.

Change control: each item ships as its own migration with a rollback file, an isolated-database acceptance test, a pre-apply backup/recovery point and explicit approval before staging application.
