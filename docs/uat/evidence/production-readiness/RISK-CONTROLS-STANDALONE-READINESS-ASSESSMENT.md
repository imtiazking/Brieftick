# Standalone Risk & Controls — readiness assessment

**Date:** 2026-11-28  
**Programme state:** Regulatory Intelligence and Ask RI **on hold** (baseline: Tranche G2 reports + staging **`b3c328e`** / **`dpl_AeGwhGCEfGiyCLfNtnQKNStFvnDQ`**). Market Intelligence unchanged. FC / KYC deferred.  
**Scope:** Assess **standalone** Risk & Controls deliverable vs capability already built **through** the RI compliance lifecycle — **reuse** shared engines; **no duplication**.

---

## Executive summary

Risk & Controls is **not a separate codebase**. It is implemented as **tenant-scoped GRC entities** (`risks`, `controls`, `assurance_reviews`, `evidence_*`, `actions`, `policies`) with **`/api/ri-lab/*` services**, Design Lab routes (`#/risks`, `#/controls`, `#/assurance`), governance (maker-checker, SoD), and downstream orchestration (`risk-control-downstream`, `control-assurance-downstream`). **S1–S5 hosted lifecycle is verified** when entered from obligations; **operational (non-regulatory) create paths exist** via lab provenance (`creationMode: operational` / `uat_authorised`).

**Standalone product gap:** commercial packaging, dedicated shell/navigation, entitlements, and **hosting proof without RI entry** — not greenfield engines.

**Rough effort to “standalone R&C v1” (reuse-only):** **4–7 engineering weeks** (1 pod), excluding commercial billing and production deploy.

---

## 1. Existing functionality (shared with RI)

| Layer | Implementation | RI coupling |
|-------|------------------|-------------|
| **Data** | Postgres: `risks`, `controls`, `assurance_reviews`, `findings`, `actions`, `evidence_items`, link tables; RLS tenant-scoped | Optional FK lineage to `regulatory_obligations` / `regulatory_changes` in metadata |
| **APIs** | `GET/PATCH/POST` `/api/ri-lab/risks`, `/controls`, `/assurance-reviews`, `/evidence`, `/links`, `/actions`, `/policies`, governance routes | Namespace `ri-lab`; permissions via `canRi` / platform roles |
| **Services** | `risks.ts`, `controls.ts`, `risk-control-downstream.ts`, `control-assurance-downstream.ts`, `impact-risk-downstream.ts` | Downstream auto-draft **after approval** when lifecycle stages run |
| **AI mappers** | `risk-mapping-mapper.mjs`, `control-mapping-mapper.mjs`, `control-coverage.mjs`, `risk-rating-policy.mjs` | Used in S2–S4 lifecycle; **paid live AI off** on staging |
| **UI** | `connected-risk-control-panels.js`, lifecycle panel, registers, report route `#/reports/risk-controls` | Bundled in **Regulatory Intelligence** Design Lab shell |
| **Provenance** | `risk-control-lab-provenance.ts` — `operational` vs `uat_authorised` vs lineage-locked children | Prevents scope/register leakage (`RI-LAB-SCOPE-REGISTERS`) |
| **Governance** | Workflow events, maker-checker, `RI-GOV-RISK-SOD`, impact approver SoD on risk approve | Same as RI governance stack |
| **Assurance** | Full S5: plan, test, fail, finding, remediation, retest, guarded closure (`RI-ASSURANCE-LIFECYCLE-GAPS`) | Evidence upload + control links |

---

## 2. Confirmed working (evidenced)

| Capability | Evidence |
|------------|----------|
| Risk register CRUD + governance transitions | `RI-RISK-CONTROL-UI`; hosted smoke **risks count 2** |
| Control register CRUD + link to risk | Same; **controls count 2** |
| Risk maker-checker / SoD | `RI-GOV-RISK-SOD`; embedded DB **~16s** suite |
| Obligation → … → assurance chain (when entered at S1+) | Hosted **38/38** lifecycle; browser **34/34** (`WORKFLOW-TRACEABILITY-REPORT.md`) |
| Assurance ↔ control ↔ finding links | `DEF-003` **resolved** |
| Assurance workflow status (not only test result) | `DEF-004` **resolved** |
| Evidence upload transaction safety | `RI-EVIDENCE-UPLOAD-SAFETY` |
| Operational vs UAT partition on registers | `RI-LAB-SCOPE-REGISTERS` **92 checks** |
| Risk/control metadata provenance (Phase 85w) | `phase85w-bus-uat-012-risk-control-provenance.mjs` |
| Control mapping retry endpoint | `/api/ri-lab/risks/[id]/retry-control-mapping` |

---

## 3. Missing capabilities (standalone product — not engine gaps)

| Gap | Notes | Class |
|-----|--------|-------|
| **Dedicated product surface** | All UI under `design-lab/regulatory-intelligence`; no separate “Risk & Controls” app host or SKU | Product / packaging |
| **Entitlement gating** | No product flag “R&C only”; Clerk/org features not split per module | Commercial config |
| **Onboarding for R&C-only tenant** | Phase 18 billing/onboarding **NOT_IMPLEMENTED** (`OPEN-011`) | Commercial |
| **Standalone go-live narrative** | No hosted UAT script that starts at **risk create** without obligation (operational path exists but not programme-gated) | Testing gap |
| **Automated risk→control→assurance without RI** | Downstream services assume **approved parent** in lifecycle; manual submit/approve works | Workflow UX |
| **Live AI risk/control mapping** | Mappers exist; `executionEnabled=false` — fixture/deterministic only | **BLOCKED** (paid AI policy) |
| **Board-grade R&C reporting** | `OPEN-010` — executive/board routes offline-verified; scheduled export **not** proven | Reporting |
| **Remediation → calendar/task at scale** | `RI-LAB-CALENDAR` PASS offline; staging calendar **empty** operationally | Data / UAT |
| **Cross-tenant hosted proof** | `OPEN-003` / `GAP-SECOND-TENANT` | External |
| **FC / KYC modules** | Explicitly **deferred** per programme directive | Out of scope |

**Do not rebuild:** obligation engine, extraction, connectors, Ask RI, or duplicate assurance/evidence/governance services.

---

## 4. Confirmed defects (R&C-relevant, from register)

| ID | Severity | Issue | Status |
|----|----------|--------|--------|
| DEF-003 | Med | Assurance list hid control link | **RESOLVED** |
| DEF-004 | Med | Assurance UI showed `DRAFT` not workflow status | **RESOLVED** |
| DEF-005 | Med | Audit history race on assurance detail | **RESOLVED** (CI + hosted) |
| OPEN-009 | Med | Assurance first-load intermittent empty history | **MONITOR** |
| OPEN-003 | High | Hosted cross-tenant denial not proven | **BLOCKED** (second org) |
| — | Low | Risk self-approve toast not surfaced (browser note) | **UX** — not blocking registers |

**RI corpus / connector defects** remain in `DEFECT-REGISTER.md` and Tranche G2 reports — **on hold**, not in R&C scope.

---

## 5. Outstanding configuration

| Item | Detail |
|------|--------|
| Staging roles Users A/B/C | Required for governance demos (existing UAT sessions) |
| `executionEnabled` / Anthropic | **false** — blocks live S2–S4 AI mapping |
| Operational vs `scope=all` registers | Documented; tenant operators use operational partition |
| Evidence storage / RLS | Configured; staging bucket policies assumed OK (upload suite PASS) |
| **Product entitlements** | Not configured for standalone SKU |

---

## 6. Outstanding testing

| Test | Status |
|------|--------|
| Promote gate (R&C suites included) | **56/56** on `b3c328e` tranche |
| Hosted **standalone entry**: create risk → approve → control → assurance (no obligation) | **NOT_RUN** as dedicated harness |
| Hosted cross-tenant on risks/controls/assurance | **BLOCKED** (`OPEN-003`) |
| Reports `#/reports/risk-controls` browser | Partial (`hosted-reports-browser.mjs` exists; OPEN-010) |
| Sustained load on risk/control APIs | **NOT_RUN** (`ENG-OPS-002` baseline only) |
| Pen-test on R&C surface | **NOT_RUN** (programme blocker) |

---

## 7. Prioritised completion backlog (Risk & Controls only)

| P | Item | Effort (indicative) | Depends on |
|---|------|---------------------|------------|
| **P0** | **Standalone hosted UAT script** — operational risk → control → assurance → evidence → closure (reuse existing APIs; no new engines) | 3–5 days | Staging sessions A/B/C |
| **P0** | **Product packaging** — route/nav/feature flag for “Risk & Controls” without RI horizon (shell only, same bundle) | 1–2 weeks | Product decision |
| **P1** | **Reports R&C** — verify/export `#/reports/risk-controls` on staging (close OPEN-010 subset) | 2–4 days | None |
| **P1** | **Calendar/remediation demo data** — minimal operational rows for R&C-only demos | 2–3 days | SQL seed policy |
| **P1** | Cross-tenant harness for risks/controls | 3–5 days | **OPEN-003** approval |
| **P2** | Live AI mapping re-validation (S2–S4) | 1 week | Paid AI approval |
| **P2** | Assurance first-load monitor (OPEN-009) | 2–3 days | If recurrence observed |
| **P3** | Entitlement matrix R&C vs RI vs MI | 1–2 weeks | Commercial / Clerk |

---

## 8. Shared commercial platform (preview — not final redesign)

**Following R&C**, remaining **platform** work (do **not** start final redesign):

| Area | State |
|------|--------|
| **Customer onboarding** | **NOT_IMPLEMENTED** (`OPEN-011`, Phase 18) |
| **Stripe billing / subscriptions** | **No routes** in platform app; AI spend ledger is **lab-only**, not customer billing |
| **Product entitlements** | Clerk org + platform roles only; no Stripe→feature matrix |
| **Administration** | `tenant-members`, `tenant-governance`, `classification-policy/admin` — **partial** (RI-focused) |
| **Auth** | Clerk on staging — **verified** |
| **Multi-tenant RLS** | Local two-org proof; **hosted cross-tenant BLOCKED** |

**Indicative effort (commercial shell, reuse auth/DB):** **6–10 weeks** (onboarding, Stripe, entitlements, admin console) — **separate tranche**, explicit commercial approval.

---

## 9. RI programme hold (preserved artefacts)

| Preserve | Location |
|----------|----------|
| Tranche G2 baseline | `TRANCHE-G2-POST-ACCEPTANCE-COMPLETION-REPORT.md`, corpus evidence, **62** missing snapshots plateau |
| Connectors | `CONNECTOR-OPERATIONAL-VERIFICATION-MATRIX.json`, **`fe027e8` / connector deploy** |
| Defects | `DEFECT-REGISTER.md` (unchanged) |
| Ask RI | Frozen eval packs; deferred to final RI stage |
| OPEN-001 | `capture-open-001-vercel-cron.mjs` may complete **~04:00 UTC 28 Nov** — do not start new loops |

**No further RI remediation tranches or corpus loops** unless programme hold is lifted.

---

## 10. Totals

| Metric | Value |
|--------|------:|
| Core R&C entities in schema | **6+** (risk, control, assurance, evidence, action, policy) |
| R&C-related API route families | **~10** |
| QA catalogue entries (R&C-heavy) | **~8** critical/high |
| Confirmed working hosted lifecycle (via RI entry) | **38/38** API, **34/34** browser |
| Standalone commercial-ready | **No** |
| Estimated engineering to standalone R&C v1 (reuse) | **4–7 weeks** |
| Estimated commercial platform (post-R&C) | **6–10 weeks** |