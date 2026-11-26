# Hosted cross-tenant test harness requirements

**Status:** prepared, **not executed** (BLOCKED — no second organisation or users).

## Required assets

| Item | Specification |
|---|---|
| Organisation B | New UUID; name e.g. `FORGENIQ UAT Tenant B`; slug `forgeniq-uat-tenant-b` |
| User D | Clerk user; `COMPLIANCE_MANAGER` in org B only |
| User E | Clerk user; `REVIEWER` in org B only |
| Publication / obligation in B | One minimal synthetic record in org B for negative read tests |

## Personas A/B/C

Remain in organisation `b8f5e3a1-00ad-4000-8000-000000000001`. Tests must prove user D/E cannot read org A records via API or Design Lab.

## Harness extension

Extend `scripts/uat/staging-user-sessions.mjs` with optional `runAs('D', …)` once Clerk accounts exist. Add `SEC-CROSS-TENANT-B` checks mirroring offline `RI-LAB-SCOPE-REGISTERS` cross-tenant denials on hosted routes.

## Approval needed

Creation of organisation B, Clerk invitations, and membership rows (security permission change).