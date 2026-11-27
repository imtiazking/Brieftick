# Go-live checklist

Legend: MET (evidenced), NOT MET, BLOCKED (needs external action; exact requirement stated). Nothing here is marked MET without evidence.

| # | Gate | Status | Evidence or exact requirement |
|---|---|---|---|
| 1 | Local gates (build, regressions, migrations, security checks) | MET | promote gate **52/52** on `a4dd45f`; navigation tranche commits `a4dd45f` / `4a4a44a` |
| 2 | Staging deployed candidate-first and promoted | MET | **`dpl_ESgsqUkZBdEexaqDE664DK9CSrgN`** (`4a4a44a` promoted); auth **19/19** official + candidate |
| 3 | Hosted A/B/C lifecycle and browser UAT | MET | 38/38 (1 BLOCKED check) and 34/34 |
| 4 | Maker-checker and SoD enforced | MET (hosted) | S1 to S5 checks; browser SoD |
| 5 | Atomic approval and Stage 2 hand-off | MET | RPC; `B-UI-ATOMIC-STAGE2-HANDOFF` |
| 6 | Paid AI disabled; ledger unchanged | MET | `executionEnabled=false`; 10 SETTLED, `$0.224872` |
| 7 | Production untouched | MET | no change to `platform`, `brieftick`, `www.forgeniq.com` |
| 8 | Horizon scanning live on a schedule | **PARTIAL** | Scheduler enabled; **8** `MANUAL_HOSTED` ticks 2026-11-27; **0** `VERCEL_CRON` until first 04:00 UTC slot; MOCI cert fix bundled — successful MOCI run pending post-deploy tick |
| 9 | Regulatory accuracy reviewed by an expert | **BLOCKED** | a regulatory professional must label a sample and sign off; no approval is claimed |
| 10 | Approved classification policy for each in-scope regulator | **BLOCKED** | approval needed (material classification-policy change); only REG-FCA has one |
| 11 | Hosted cross-tenant isolation | **BLOCKED** | second organisation and test users (new access: needs approval); offline RLS proof exists |
| 12 | Notifications delivered and verified | **PARTIAL** | In-app API + `#/notifications/inbox` verified; external delivery disabled by policy |
| 13 | Live AI pipeline validated on staging | **BLOCKED** | explicit authorisation and a defined spend limit for paid AI |
| 14 | Business UAT sign-off | **BLOCKED** | a named business owner must sign (`businessUatApproved=false`) |
| 15 | Data quality: DISCONNECTED obligations | **PARTIAL** | **10** synthetic pilot rows repaired; **8** legacy/partner DISCONNECTED preserved |
| 16 | Backup/restore and DR drill | NOT MET | not performed |
| 17 | Load, performance and CPU baseline | NOT MET | not performed |
| 18 | External penetration test | **BLOCKED** | third-party engagement (commercial commitment: needs approval) |
| 19 | Onboarding flow and commercial terms | NOT MET | design and approval; live billing must not be activated |
| 20 | Production deployment | **BLOCKED** | explicit approval; **not performed** |
| 21 | Reports and exports, Ask RI browser verification | NOT MET | verify on staging |
| 22 | Open Medium defects (DEF-011, OPEN-007, OPEN-008) | NOT MET | see `DEFECT-REGISTER.md` |
