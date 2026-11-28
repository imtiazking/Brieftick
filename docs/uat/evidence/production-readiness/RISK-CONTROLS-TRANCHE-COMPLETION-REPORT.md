# Risk & Controls tranche — completion report

**Date:** 2026-11-28  
**RI programme:** **ON HOLD** (baseline `0307080` docs + `b3c328e` staging RI). No corpus loops restarted.  
**Scope delivered:** Standalone Risk & Controls product entry, entitlements, operational lifecycle harness, reporting, defect UX.

---

## 1. Existing functionality reused (no duplicate engines)

Risk, control, assurance, evidence, policy, action, governance, workflow events, RLS, `/api/ri-lab/*` services, Design Lab connected panels, maker-checker — **unchanged architecture**, extended only where noted below.

---

## 2. New functionality implemented

| Area | Detail |
|------|--------|
| **Product shell** | `/risk-controls` → `/design-lab/risk-controls/index.html`; meta `forgeniq-product=risk_controls`; standalone sidebar nav |
| **Entitlements** | Migration `organisations.product_entitlements`; `lib/platform/product-entitlements.ts`; enforced in `requireRiContext`; `GET /api/platform/entitlements` |
| **Operational lifecycle** | `acceptance-standalone-rc-operational-lifecycle-e2e.mjs` (no obligation); hosted harness `hosted-standalone-rc-lifecycle-uat.mjs` |
| **Reporting** | `GET /api/ri-lab/reports/risk-controls` + connected UI `#/reports/risk-controls` |
| **Assurance standalone** | Fallback assurance plan when stage-5 AI skips (operational controls) |
| **Risk SoD** | Approve uses latest `RISK_SUBMITTED` actor; UI toast only celebrates approval when status is actually approved |
| **Assurance metadata** | `assuranceWorkflowStatus` tolerates JSON string metadata |

---

## 3. Confirmed defects addressed

| Item | Resolution |
|------|------------|
| Risk self-approval toast | UI checks returned risk/control status before success toast |
| Risk SoD | Submitter trace via workflow event on approve |
| OPEN-009 | Not reproduced in this tranche; **MONITOR** |
| OPEN-003 | Embedded cross-tenant PASS in standalone E2E; hosted second org still **BLOCKED** |

---

## 4. Standalone lifecycle results (local)

**`RC-STANDALONE-LIFECYCLE-E2E`:** PASS — operational risk → control → assurance → evidence → test → closure path without regulatory obligation.

**`PLATFORM-PRODUCT-ENTITLEMENTS`:** PASS — `risk_controls`-only org blocks `triage:read`, allows `risk:read`.

---

## 5. Product shell and navigation

- Entry: **`/design-lab/risk-controls`**, **`/risk-controls`**
- Nav: dashboard, risk register, controls, policies, assurance, issues, evidence, reports (R&C), work, admin (subset)
- **No visual redesign** — reuses RI Design Lab bundle with product meta injection

---

## 6. Reporting

- API returns live operational counts: risks, controls, assurance, remediation, evidence linkage, ownership gaps
- UI renders tenant JSON (no fabricated records)

---

## 7. Product entitlement architecture

- Products: `market_intelligence`, `regulatory_intelligence`, `risk_controls`, `financial_crime` (catalogue)
- Default staging: MI + RI + R&C
- GRC API actions: any of `risk_controls` | `regulatory_intelligence`
- RI-only APIs: require `regulatory_intelligence`
- Stripe/onboarding mapping: **deferred** to commercial programme

---

## 8. Commercial platform dependencies (unchanged)

Stripe billing, self-serve onboarding, subscription SKUs, second hosted org (OPEN-003) — see `COMMERCIAL-PLATFORM-READINESS-SKETCH.md`.

---

## 9. Remaining engineering effort (indicative)

| Item | Effort |
|------|--------|
| Hosted standalone UAT evidence on staging | 0.5–1 day (after deploy) |
| OPEN-003 second org on staging | Blocked on auth |
| Risk appetite / RC indicators dedicated screens | Optional UX (1–2 weeks) |
| Commercial entitlements ↔ Stripe | 6–10 weeks (commercial tranche) |

---

## 10. Staging deployment

| Field | Value |
|-------|--------|
| Status | **Pending** — commit + promote gate + candidate deploy after this report |
| Prior RI baseline | `b3c328e` / `dpl_AeGwhGCEfGiyCLfNtnQKNStFvnDQ` (unchanged corpus) |

---

## Essential launch vs optional

**Essential (this tranche):** product entry, entitlements enforcement, operational lifecycle proof, R&C report API/UI, SoD UX.  
**Optional:** dedicated risk appetite UI, RC indicators module, hosted cross-tenant with org B, Stripe mapping.