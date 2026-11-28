# Commercial platform — readiness sketch

**Date:** 2026-11-28  
**Scope:** Shared platform (onboarding, subscriptions, Stripe, entitlements, administration) — **assessment only**; **no** final platform redesign.

---

## Current state

| Capability | Status | Reference |
|------------|--------|-----------|
| Authentication (Clerk) | **Working** on staging | `OPEN-008`, staging sessions |
| Tenant + org model | **Working** (single-org UAT focus) | `tenant_governance`, membership APIs |
| Platform roles (A/B/C style) | **Working** | RI governance suites |
| **Customer onboarding funnel** | **NOT_IMPLEMENTED** | `OPEN-011`, Phase 18, `RI-GO-LIVE-REMAINING-WORK.md` |
| **Stripe subscriptions / checkout** | **NOT_IMPLEMENTED** | No billing routes in `apps/platform` |
| **Product entitlements (RI vs MI vs R&C)** | **NOT_IMPLEMENTED** | Roles only; no SKU matrix |
| **Self-serve admin (billing, seats, plans)** | **NOT_IMPLEMENTED** | Partial RI admin APIs only |
| AI provider spend guard | **Lab-only** ledger | Not customer-facing metering |
| Hosted cross-tenant security proof | **BLOCKED** | `OPEN-003` |
| Pen-test / SOC2 narrative | **NOT_START** | Programme blocker |

---

## What exists to reuse

- Clerk org + user sessions and staging UAT harness (`staging-user-sessions.mjs`).
- RLS-first Postgres; organisation-scoped data for all products.
- `tenant-members`, `tenant-governance`, classification policy admin (RI-biased).
- Vercel staging project `forgeniq-platform-staging` and promote gate.

---

## Gaps before commercial GA (indicative)

1. Sign-up → org provisioning → plan selection → payment (Stripe Checkout or Billing Portal).
2. Entitlement middleware: map Stripe product/price → feature flags (MI, R&C, RI, Ask RI).
3. Admin UI: members, roles, subscription status, usage caps (optional).
4. Hosted UAT with second billing customer; cross-tenant stays **OPEN-003**.
5. Webhooks (Stripe → org state); idempotent provisioning.

**Indicative effort:** **6–10 engineering weeks** (1 pod), plus Stripe/Clerk dashboard configuration — **after** standalone R&C product packaging is defined.

---

## Out of scope (per directive)

- Final marketing/site redesign.
- Production deployment.
- Paid AI metering as customer SKU (until policy lifted).
- FC / KYC products.