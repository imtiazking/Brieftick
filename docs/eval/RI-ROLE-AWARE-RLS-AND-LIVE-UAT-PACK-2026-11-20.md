# FORGENIQ — Role-aware RLS and live AI obligation UAT: approval pack (2026-11-20)

Status: **migration applied to staging 2026-11-20 ~15:07 UTC (approved); UAT not started.** Branch `fix/ri-role-aware-rls`, commit `e36b0df` (on `5bea5af`, the deployed staging build). Remaining database security work: `docs/security/SECURITY-BACKLOG.md` (database security is not complete).

## 0. Staging application record (2026-11-20)

| Check | Result |
|---|---|
| Migration file / rollback file hashes | match `e36b0df` (values below) |
| Existing backup `staging-db-2026-11-19T222804Z` | 20/20 checksums OK, restore rehearsal PASS; predates the three migrations applied 10:12 UTC today |
| Fresh recovery point | private schema `forgeniq_recovery_20261120` (58 tables + `_policies` 192, `_table_grants` 1210, `_manifest`); 58/58 table checksums equal live; no API access. Local fingerprint `C:\Users\imtia\FORGENIQ-backups\recovery-point-2026-11-20T1505Z\pre-migration-fingerprint.json`. A full physical dump still requires `Backup-ForgeniqStaging.ps1` (database password). |
| Pre-apply policy fingerprint | `6e1dddddfae40b631311ce4debdb58ff` = tested baseline |
| Applied | Supabase migration `ri_role_aware_rls` (history 29 → 30 rows) |
| Post-apply policy fingerprint | `021c749e8161441f4ee5200f349e2c41` = tested result; 181 public policies, 121 write |
| Membership-only write policies left | none |
| `workflow_events` policies | `insert_actor` (INSERT), `select_member` (SELECT) only |
| TRUNCATE for anon/authenticated | 0 of 58 tables |
| Storage evidence policies | `insert/update/delete_analyst`, `select_member` |
| New functions `search_path` | pinned empty; trigger active on `regulatory_obligations`, `ai_analysis_runs` |
| Existing data | 58/58 public tables and 232 storage objects byte-identical to the recovery point |
| Behaviour (28 rolled-back probes under real identities + transient REVIEWER/VIEWER) | 28/28 as expected; nothing persisted (verified) |
| Compliance module reads as Compliance Manager | all 23 modules return full counts (tenant notifications recipient-scoped, policy unchanged) |
| Application | `/health` 200 on build `5bea5af`; sign-in 200; API 401 when signed out; 0 runtime errors in the last 30 min; no deployment made |
| Scheduler | 0 crons on the production deployment; last ingestion run 2026-11-18 20:06 UTC |

Rollback (available, not executed): run `apps/platform/supabase/rollbacks/20261120140000_ri_role_aware_rls.down.sql` (hash below), then `delete from supabase_migrations.schema_migrations where name = 'ri_role_aware_rls'`. Expected public fingerprint afterwards `6e1dddddfae40b631311ce4debdb58ff`. Data restore, if ever needed, from `forgeniq_recovery_20261120` (schema can be dropped once UAT is accepted).

## 1. Role-aware RLS migration

Files:

| File | SHA-256 |
|---|---|
| `apps/platform/supabase/migrations/20261120140000_ri_role_aware_rls.sql` | `F5F66A32C9D5E71216D3FE058EE4FAE9A52226FF4C991A77128CA5346CC401F2` |
| `apps/platform/supabase/rollbacks/20261120140000_ri_role_aware_rls.down.sql` | `E2EC5D01BACEFA3FC57AF178F3F0500170876F451BBB59DCBF3101B278C20968` |

Database rules after the migration (mirrors `lib/ri/permissions.ts`):

- VIEWER: read only. May append only its own `ASK_RI_QUERY_COMPLETED`, `EVIDENCE_PREVIEWED`, `EVIDENCE_DOWNLOADED` events and its own Ask RI log rows.
- REVIEWER: record AI review decisions; set the run review status to match its own review; materialise DRAFT AI-assisted changes/obligations from an accepted review; approve or return an AI obligation that is `IN_REVIEW` (status column only). Cannot create or edit manual records, risks, controls, links, evidence or assurance records, and cannot submit (DRAFT → IN_REVIEW).
- ANALYST: compliance writes (changes, obligations, applicability, impact, risks, controls, policies, evidence, findings, actions, links, AI run requests). Deletes only where the application deletes (actions, action links, impact business areas, AI runs, obligation policy/risk links, evidence versions).
- COMPLIANCE_MANAGER: additionally assurance reviews and their links.
- ADMIN/OWNER: additionally deletes on the remaining compliance tables.
- Audit events (`workflow_events`): insert-only through the API, actor must be the caller, event types limited by role. No role (including OWNER) can update or delete them.
- `TRUNCATE` revoked from `anon`/`authenticated` on all public tables (TRUNCATE bypasses RLS).
- Evidence storage bucket `ri-tenant-evidence`: upload/replace/delete require ANALYST in the folder's organisation.
- Tenant isolation unchanged: every rule requires an active membership in the row's organisation.

No application code change and no Vercel deployment are required.

### Isolated database evidence (embedded Postgres 18, never staging)

- `acceptance-ri-role-aware-rls-local-db.mjs`: **68/68 PASS**. Covers byte-identical data after apply, idempotency, 285 insert/update/delete checks (19 tables × 5 roles), audit append-only, Ask RI, AI notifications, storage, the full AI workflow by role, refused approvals (VIEWER, requester, acceptor/submitter, other tenant), REVIEWER limits, tenant isolation, manual workflows, rollback restoring the exact policy set, and re-apply.
- `acceptance-ri-guards-and-scheduler-local-db.mjs`: PASS (expectations updated: REVIEWER can no longer submit; VIEWER approval and review edits now match no rows instead of raising).
- `acceptance-phase-8-security-rls.mjs --local-db`: PASS (VIEWER may no longer emit tenant AI notifications; no app path does).
- Also PASS: phase-3a, phase-3 schema, phase-2 tenant isolation, phase-6, phase-7 ingestion ops, phase-7c6, phase-8c1, governance workflow events, impact draft save, AI review maker-checker, 85w assurance/findings.
- Pre-existing failures, unchanged and unrelated: phase-7c6a (`experimental_ai_wrong_organisation` fixture), phase-8b FCA ingestion fixture, phase-8 tenant-notifications (missing fixture module).

Staging equivalence: the public policy fingerprint on staging (`md5 6e1dddddfae40b631311ce4debdb58ff`, 125 write policies) is identical to the local pre-migration database, so the local results apply to staging. Expected public fingerprint after apply: `021c749e8161441f4ee5200f349e2c41`.

### Application procedure (on approval)

1. Pre-check (read-only): public policy fingerprint = `6e1dddddfae40b631311ce4debdb58ff`; `ri_has_min_role` absent; record row counts for AI Development, Partner UAT, Org A, Security Isolation B.
2. Apply the migration file (hash verified) as Supabase migration `ri_role_aware_rls`.
3. Post-check (read-only): fingerprint = `021c749e8161441f4ee5200f349e2c41`; no membership-only write policies; no TRUNCATE for API roles; storage evidence policies `*_analyst`; row counts unchanged; staging error logs clean.
4. Smoke (no writes): staging pages load for members A and B (Design Lab lists, obligation register, AI analysis page).

### Rollback procedure

Run the rollback file (hash verified). Expected: public fingerprint returns to `6e1dddddfae40b631311ce4debdb58ff`, storage member policies restored, TRUNCATE grants restored, no data change (proven locally). Then remove the `ri_role_aware_rls` row from the migration history.

### Residual risks (not changed by this migration)

- `finding:close` (COMPLIANCE_MANAGER) is enforced by the application only; ANALYST can update findings in the database.
- `created_by_user_id` on manual records is not bound to the caller (AI-assisted records already are).
- The service role can still modify audit events (server-side only).
- `tenant_notifications` recipient-update policy unchanged.

## 2. Live UAT specification (AI Development only, FG24/6)

Current staging state (read-only, 2026-11-20): AI Development has no FG24/6 change, applicability, obligations, risks or controls; no FG24/6 AI runs. No duplicates possible. Other organisations are not touched.

Publication `ec168f48-1717-4631-8e4a-a3e95df4d5ce`, version `af28173b-f446-450b-a390-e645a554e524`, PDF revision `5138fabf-983f-4694-81d4-0336df6f4e78` (17 pages).

People: A = `user_3LA76vR4CueutWtEpcAxvqYKkEv` (COMPLIANCE_MANAGER), B = `user_3LIQIZlXNWBFEvSKabAYIUhhNdi` (COMPLIANCE_MANAGER), C = new independent REVIEWER (pending).

All steps are performed by the named person in the staging application; I verify each step read-only.

| # | Who | Action | Record (label `UAT — FG24/6`) |
|---|---|---|---|
| 1 | A | Track FG24/6 for AI Development; create a manual regulatory change | `UAT — FG24/6 risk-based approach to payments` |
| 2 | A | Applicability assessment, submit for review | applicability for FG24/6 |
| 3 | B | Approve applicability (A cannot) | — |
| 4 | A | Impact assessment (required if applicable), submit | impact for the UAT change |
| 5 | B | Approve impact | — |
| 6 | A | Request one UC-RI-005 analysis (paid, one attempt) | AI run |
| 7 | B | Review: accept only claims verified against the FCA PDF; reject unsupported claims | review + DRAFT AI obligations |
| 8 | B | Submit accepted obligations for review | DRAFT → IN_REVIEW |
| 9 | A, B | Attempt approval (must be refused: requester, acceptor/submitter) | refusal evidence |
| 10 | C | Independently check each obligation against the PDF page cited, then approve | IN_REVIEW → OPEN |
| 11 | A | Create one risk and one control, link obligation ↔ risk, obligation ↔ control, risk ↔ control | `UAT — FG24/6 …` risk and control |
| 12 | me | Read-only audit query: events, actors, lineage, materialisations, links; other organisations' counts unchanged | report |

Execution limits for step 6: cap `RI_LAB_ANTHROPIC_MAX_USD` = 1.00 USD (confirmed 2026-11-20); expected reserve about 0.16 USD; timeout `RI_ANTHROPIC_TIMEOUT_MS` = 180000; retry reserve factor not set (1, no retries). UC-RI-002 not executed; scheduler stays disabled.

## 3. Independent REVIEWER onboarding

1. You provide name and email.
2. I show the exact invitation and membership before creating anything:
   - Clerk invitation to the staging application for that email.
   - After sign-up: one `organisation_memberships` row — AI Development, role `REVIEWER`, status `active`. No other organisation, no platform operator, no other role.
3. Verification: C sees AI Development only; C can approve an IN_REVIEW AI obligation; C cannot create records, links, request AI runs or approve applicability/impact.

## 4. Gate before the paid run

- [ ] RLS migration approved and applied; post-checks pass.
- [ ] Reviewer C created and verified.
- [ ] Steps 1–5 complete.
- [ ] Cap and timeout re-confirmed immediately before step 6.
- [ ] A, B and C available for steps 6–11.
