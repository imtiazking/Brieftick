# Go-live checklist

Legend: MET (evidenced), NOT MET, BLOCKED (needs external action; exact requirement stated). Nothing here is marked MET without evidence.

| # | Gate | Status | Evidence or exact requirement |
|---|---|---|---|
| 1 | Local gates (build, regressions, migrations, security checks) | MET | promote gate 52/52; CI success for `782d55c` |
| 2 | Staging deployed candidate-first and promoted | MET | `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx` |
| 3 | Hosted A/B/C lifecycle and browser UAT | MET | 38/38 (1 BLOCKED check) and 34/34 |
| 4 | Maker-checker and SoD enforced | MET (hosted) | S1 to S5 checks; browser SoD |
| 5 | Atomic approval and Stage 2 hand-off | MET | RPC; `B-UI-ATOMIC-STAGE2-HANDOFF` |
| 6 | Paid AI disabled; ledger unchanged | MET | `executionEnabled=false`; 10 SETTLED, `$0.224872` |
| 7 | Production untouched | MET | no change to `platform`, `brieftick`, `www.forgeniq.com` |
| 8 | Horizon scanning live on a schedule | **NOT MET** | enable scheduler (Vercel cron) and run connectors until sources are current; needs authorisation for the recurring external fetch |
| 9 | Regulatory accuracy reviewed by an expert | **BLOCKED** | a regulatory professional must label a sample and sign off; no approval is claimed |
| 10 | Approved classification policy for each in-scope regulator | **BLOCKED** | approval needed (material classification-policy change); only REG-FCA has one |
| 11 | Hosted cross-tenant isolation | **BLOCKED** | second organisation and test users (new access: needs approval); offline RLS proof exists |
| 12 | Notifications delivered and verified | NOT MET | enable `tenant_notifications`; verify delivery |
| 13 | Live AI pipeline validated on staging | **BLOCKED** | explicit authorisation and a defined spend limit for paid AI |
| 14 | Business UAT sign-off | **BLOCKED** | a named business owner must sign (`businessUatApproved=false`) |
| 15 | Data quality: 18 DISCONNECTED obligations | NOT MET | repair 11 UAT via the workflow; owner decision for 7 legacy |
| 16 | Backup/restore and DR drill | NOT MET | not performed |
| 17 | Load, performance and CPU baseline | NOT MET | not performed |
| 18 | External penetration test | **BLOCKED** | third-party engagement (commercial commitment: needs approval) |
| 19 | Onboarding flow and commercial terms | NOT MET | design and approval; live billing must not be activated |
| 20 | Production deployment | **BLOCKED** | explicit approval; **not performed** |
| 21 | Reports and exports, Ask RI browser verification | NOT MET | verify on staging |
| 22 | Open Medium defects (DEF-011, OPEN-007, OPEN-008) | NOT MET | see `DEFECT-REGISTER.md` |
