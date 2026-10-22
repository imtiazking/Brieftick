# RI golden master productionisation map

**Golden master (behaviour + UX):** Design Lab @ `5f95f223` / `ri-design-lab-global-sources`  
**Production engine:** `apps/platform` + `packages/reference-data` + `integrations/regulatory-sources`  
**Integration branch:** `production/ri-golden-master`

## Branch ancestry (audit)

| Line | Branch | HEAD (at 7C.1 start) | Tags |
| --- | --- | --- | --- |
| A — Design Lab global sources | `design-lab/regulatory-intelligence-global-sources` | `5f95f223` | `ri-design-lab-global-sources` |
| B — Production platform | `production/regulatory-intelligence` | `ea59432` → 7B.2 | `ri-production-design-parity` |
| C — Frozen lab | (tag only) | `d46ca1b` | `ri-design-lab-freeze` |
| D — Unstaged | working tree | verification fixture drift only | — |

Merge-base (B ∩ A): `83385e7` (7B production parity). Production does **not** import Design Lab runtime JS.

## Golden master rule

For the same deterministic fixture dataset:

`DESIGN LAB RESULT` **must equal** `PRODUCTION PARITY RESULT` unless documented as `INTENTIONAL_PRODUCTION_DIFFERENCE`.

Harness: `scripts/acceptance-phase-7c1-golden-master.mjs` + `lib/ri/lab-compat/*`.

## Adapter contract

See `lib/ri/lab-compat/adapter-contract.md`.

## Module classification

| Module | Class | Production path |
| --- | --- | --- |
| Dashboard UI | REUSE_UI_AS_IS | `/ri` + `RiLabPriorityMetrics` |
| Dashboard counts | REUSE_BUSINESS_LOGIC | `lab-compat/dashboard-parity.mjs` ↔ `services/dashboard.ts` |
| Obligation taxonomy | REUSE_BUSINESS_LOGIC | `lab-compat/obligation-portfolio.mjs` ↔ `enums.ts` |
| Horizon | REUSE_WITH_ADAPTER | `/ri/horizon` + `services/horizon.ts` |
| Calendar | REUSE_WITH_ADAPTER | `/ri/calendar` + `services/calendar.ts` |
| Publications | REUSE_WITH_ADAPTER | `/ri/publications` + `services/publications.ts` |
| Changes / Impact / Obligations | PORT_TO_SERVER | `services/changes.ts`, `impact.ts`, `obligations.ts` |
| Policies / Risks / Controls / Actions | PORT_TO_SERVER | respective `services/*` |
| Evidence / Findings / Assurance | PORT_TO_SERVER | explicit link tables |
| Work queue | REUSE_WITH_ADAPTER | `services/work-queue.ts` |
| Landscape / catalogue | REUSE_UI_AS_IS | `/ri/landscape*` + `catalogue-display.ts` |
| Ingestion / sources | REPLACE_CONNECTOR | `lib/ri/ingestion/*` + admin routes |
| Auth | REPLACE_AUTH | Clerk + `requireRiContext` |
| Org / tenant | REPLACE_STORAGE | `organisations` + active org cookie |
| RBAC | REPLACE_AUTH | `lib/ri/permissions.ts` |
| Fixtures (runtime) | REPLACE_FIXTURE_DATA | Supabase only in production |
| localStorage business state | REPLACE_STORAGE | forbidden in `/ri` runtime |
| AI Governance / Operations | DEFER_AI | lab golden master; prod placeholder |
| Ask RI | DEFER_ASK_RI | lab golden master + eval suites |
| Regulator catalogue | REUSE_BUSINESS_LOGIC | `packages/reference-data` |
| Connectors | REPLACE_CONNECTOR | `integrations/regulatory-sources` |

## Migration order (7C.x)

1. Dashboard ✓ (priority strip + parity harness)  
2. Publications → Horizon → Calendar → Changes → … (incremental; 7C.1 establishes layer)

## Intentional production differences

| Area | Difference |
| --- | --- |
| Auth | Clerk users vs demo personas |
| Data | Tenant RLS vs single mock tenant |
| AI / Ask RI | Not enabled in production runtime |
| Sector landscape matrix | Reference-only in production |
