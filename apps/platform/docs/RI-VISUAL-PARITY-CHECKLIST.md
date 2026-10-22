# RI visual parity checklist (Design Lab → Production)

**Design Lab reference:** `ri-design-lab-global-sources` @ `5f95f223` (`http://localhost:3000/design-lab/regulatory-intelligence/`)  
**Production:** `http://localhost:3001/ri` (`apps/platform`)

| View | Design Lab | Production route | Layout parity | Feature parity | Known differences | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `#/dashboard` | `/ri` | PASS | PASS | Live DB counts; banner when ingestion not enabled | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Horizon | `#/horizon` | `/ri/horizon` | PASS | PASS | Regulator/source filters use catalogue IDs | PASS |
| Calendar | `#/calendar` | `/ri/calendar` | PASS | PASS | Month grid depth reduced | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Publications | `#/library` | `/ri/publications` | PASS | PASS | Pagination via DB | PASS |
| Publication detail | `#/publication/*` | `/ri/publications/[id]` | PASS | PARTIAL | AI tab placeholder Phase 8 | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Changes | `#/changes` | `/ri/changes` | PASS | PASS | Phase 7C.3 lab register columns; see `docs/visual-review/phase-7c3-lifecycle-parity.md` | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Impact assessments | `#/assessments` | `/ri/impact-assessments` | PASS | PASS | Phase 7C.3; no lab AI assessment panel | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Obligations | `#/obligations` | `/ri/obligations` | PASS | PASS | Phase 7C.3 metrics row + canonical taxonomy harness | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Policies / Risks / Controls | lab lists | `/ri/policies` etc. | PASS | PASS | Phase 7C.4 parity harness; see `docs/visual-review/phase-7c4-downstream-parity.md` | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Actions | `#/actions` | `/ri/actions` | PASS | PASS | Phase 7C.4 overdue parity | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Evidence | `#/evidence` | `/ri/evidence` | PASS | PASS | Direct vs supporting; EVD-009 harness | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Findings | `#/finding` | `/ri/findings` | PASS | PASS | Action-sourced attribution only | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Assurance | `#/assurance` | `/ri/assurance` | PASS | PASS | Phase 7C.4 review linkage parity | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Trace | obligation lineage | `/ri/trace/[obligationId]` | PASS | PASS | Flagship chains harness | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Work queue | `#/work-queue` | `/ri/work-queue` | PASS | PASS | Phase 7C.5 harness; no AI queue rows; team scope = org pool | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Governance | `#/governance` | `/ri/governance` | PASS | PARTIAL | `workflow_events` history; committee packs FUTURE | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Landscape home | `#/landscape` | `/ri/landscape` | PASS | PARTIAL | Sector matrix not ported | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Global catalogue | `#/landscape/catalogue` | `/ri/landscape/catalogue` | PASS | PASS | Shared `packages/reference-data` | PASS |
| Reporting | `#/reports` | `/ri/reporting` | PASS | PASS | Phase 7C.5 metrics harness; no AI board narrative | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Sources / ingestion | `#/ingestion` | `/ri/admin/sources` | PASS | PASS | Role-gated; NOT ENABLED banner | PASS |
| AI Governance | `#/ai-governance` | `/ri/ai-governance` | PASS | PLACEHOLDER | COMING IN PHASE 8 | PASS_WITH_INTENTIONAL_DIFFERENCE |
| AI Operations | `#/ai-operations` | `/ri/ai-operations` | PASS | PLACEHOLDER | COMING IN PHASE 8 | PASS_WITH_INTENTIONAL_DIFFERENCE |
| Ask RI | `#/ask-ri` | nav label only | PASS | PLACEHOLDER | COMING LATER | PASS_WITH_INTENTIONAL_DIFFERENCE |

**Overall visual parity:** PASS_WITH_INTENTIONAL_DIFFERENCES (auth shell, real data, placeholders for AI/Ask RI).
