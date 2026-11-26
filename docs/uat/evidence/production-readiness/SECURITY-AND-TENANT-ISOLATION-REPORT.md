# Security and tenant isolation report

## Tenant isolation

| Evidence | Layer | Result |
|---|---|---|
| `acceptance-ri-role-aware-rls-local-db` | real Postgres, RLS, two organisations, non-superuser roles | PASS |
| `RI-LAB-SCOPE-REGISTERS` (92 checks) | real Postgres: `scope=all` never adds a row the tenant-scoped query did not return; link-table and plan lookups denied across organisations | PASS, mutation-verified |
| `RI-LAB-CALENDAR` (41 checks) | route wiring: `ri:read`, RLS-scoped tenant listers, no privileged client | PASS, mutation-verified |
| Hosted cross-tenant denial (`SEC-CROSS-TENANT`) | hosted | **BLOCKED** |

**Why hosted cross-tenant denial is BLOCKED:** personas A, B and C all belong to one organisation, so a hosted cross-tenant request cannot be constructed. It needs a second tenant and user access, which is a security-permission change that needs approval. Offline RLS evidence stands; hosted proof does not exist.

**Design rule held:** the `scope` flag only partitions rows by provenance. Tenant isolation comes from RLS on the queries that produce the rows. No scope or permission was weakened to make records visible.

## Maker-checker and segregation of duties (hosted)

- Self-approval refused at obligation, impact, risk and control stages (`S1-SELF-APPROVE` to `S4-SELF-APPROVE`) and in the browser (`A-UI-SELF-APPROVAL-REFUSED`, persisted status confirmed after reload). Assurance closure before approval of the plan is refused (`S5-PREMATURE-CLOSE`). A dedicated self-approval check for the assurance plan itself is not in the suite.
- An independent REVIEWER cannot edit obligation content through the approval path (`S1-REVIEWER-NO-CONTENT-EDIT`); see SEC-001 for the residual gap on DRAFT impact content.
- Closure cannot happen with an open finding (`S5-CLOSE-BLOCKED-BY-OPEN-FINDING`) or while a test is failing (`S5-CLOSE-WHILE-FAIL`); closure is idempotent.
- Approval of an obligation is atomic with the creation of its Stage 2 impact (`approve_obligation_with_stage2`); no partial state is observable.

## Findings

| ID | Severity | Finding |
|---|---|---|
| SEC-001 | Low to Medium | A REVIEWER who invokes the approval RPC directly can author the DRAFT impact's content. The action is audited and attributed, and the obligation edit itself remains blocked by the trigger. Recommend restricting the Stage 2 content parameters to the maker role. |
| SEC-002 | Medium (process) | Acceptance suites rewrite committed historical evaluation evidence (`docs/eval/*`) when run. This risks altering historical evidence, so it was restored from git after every sweep. Recommend directing suite output to an untracked directory. |
| SEC-003 | High, open | Hosted cross-tenant denial unproven (BLOCKED above). |
| SEC-004 | Info | The platform-foundation guard fails on an uncommitted working tree in `design-lab/regulatory-intelligence`; it passes once changes are committed. |

## Application and AI controls

Secrets scan of platform sources (`acceptance-platform-foundation`) PASS. Service-role references absent from client paths PASS. Output escaping in the new calendar client (hostile titles, kinds, ids and statuses) PASS. The `/api/ri-lab/calendar` route is `force-dynamic` and requires `ri:read`. QA security gates 3/3 passed in the promote run. Paid-AI controls are covered in `AI-EXECUTION-GOVERNANCE-REPORT.md`.

## Not done

Independent penetration test, hosted WAF or rate-limit verification, and hosted RLS proof with a second tenant. No permissions, credentials or Clerk configuration were changed.
