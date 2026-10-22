# RI permissions matrix (Phase 4–5)

Server enforcement via `lib/ri/permissions.ts` and `requireRiContext(action)`.

| Action | Minimum role |
| --- | --- |
| Read RI entities | VIEWER |
| Triage write | ANALYST |
| Applicability write | ANALYST |
| Regulatory change write | ANALYST |
| Impact draft edit | ANALYST |
| Impact submit | ANALYST |
| Impact review (reviewer field) | REVIEWER |
| Impact approve / reject | COMPLIANCE_MANAGER |
| Obligation write | ANALYST |
| Obligation review-oriented transitions | REVIEWER |
| Policy / risk / control / action / evidence write | ANALYST |
| Finding write | ANALYST |
| Finding close | COMPLIANCE_MANAGER |
| Assurance write | COMPLIANCE_MANAGER |

ADMIN and OWNER inherit COMPLIANCE_MANAGER rank via `roleAtLeast`.

Mutations reject `organisation_id` in form payloads that do not match the active organisation. Approver and owner fields for governance actions are set from the authenticated Clerk user id on the server, not from the browser.
