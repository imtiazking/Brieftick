# Design Lab verification report

Scope: the Design Lab frontend only (`design-lab/regulatory-intelligence`, synced to `apps/platform/design-lab-bundle/...` by `scripts/sync-design-lab-bundle.mjs`). **The legacy `/ri/*` frontend was not developed.**

## Requirements and status

| Requirement | Status | Evidence |
|---|---|---|
| Dark charcoal and emerald terminal UI: Publications | VERIFIED, hosted browser | `A-PUBLICATIONS-THEME` |
| Same: Obligations | VERIFIED, hosted browser | `A-OBLIGATIONS-THEME` |
| Centred detail modal with blurred backdrop: Publications and Obligations; closes and returns focus | VERIFIED, hosted browser | `A-PUBLICATIONS-MODAL(-CLOSE)`, `A-OBLIGATIONS-MODAL(-CLOSE)` |
| Terminal theme and modals on other registers (Risks, Controls, Assurance) | Registers verified functionally; the theme was not asserted for them | `C-REGISTER-*` |
| Connected data (tenant API through RLS) rather than static prototype data | VERIFIED | `scope=operational` requests only; `RI-LAB-SCOPE-REGISTERS` |
| Lifecycle navigation across five stages | VERIFIED, hosted browser | `C-LIFECYCLE-PANEL`, `C-NAV-*` |
| Regulatory calendar (connected) | VERIFIED rendering and window selector; staging has no operational dated records, so the calendar renders its empty state | `C-CALENDAR-RENDERS-FROM-TENANT-API`, `C-CALENDAR-WINDOW`, `C-CALENDAR-API-SCOPE-ALL` (labelled `hosted-api`) |

Screenshots: `docs/uat/evidence/browser-abc-2026-11-26/` (`C-calendar.png`, modals, lifecycle panel).

## Defects fixed in the Design Lab this tranche

Audit history wiped by detail load; assurance workflow state always `DRAFT`; assurance/control links missing; calendar placeholder replaced by a connected view. See DEFECT-REGISTER DEF-003 to DEF-005 and DEF-009. DEF-011 (unexplained, non-recurring loading state) remains open.

## Honest limits

- Browser runs used Chromium via Playwright as users A, B and C; Firefox, Safari, real mobile devices, and assistive-technology checks were not run. Keyboard focus return on modal close is tested; screen-reader behaviour is not.
- Detail panels hydrate progressively (the control link can take 2 to 4 s to appear). It works, but is a perceived-latency item worth a skeleton state.
- Ask RI, report exports and the evidence file chooser were not exercised in the browser on staging.
- The Design Lab source is the one place changes are made; the bundle is generated. The platform-foundation guard fails if source changes are uncommitted.
