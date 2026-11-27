# Go-live checklist

Legend: MET (evidenced), NOT MET, BLOCKED (needs external action; exact requirement stated). Nothing here is marked MET without evidence.

| # | Gate | Status | Evidence or exact requirement |
|---|---|---|---|
| 1 | Local gates (build, regressions, migrations, security checks) | MET | promote gate **56/56** 2026-11-27 (eCFR + catalogue 42); prior `a4dd45f` navigation tranche |
| 2 | Staging deployed candidate-first and promoted | MET | Official **`dpl_644WDsZPXcMXKPB9Q2WzS3GuuGsg`** git **`8c58e2e`**; Tranche E candidate pending promote after this commit |
| 3 | Hosted A/B/C lifecycle and browser UAT | MET | 38/38 (1 BLOCKED check) and 34/34 |
| 4 | Maker-checker and SoD enforced | MET (hosted) | S1 to S5 checks; browser SoD |
| 5 | Atomic approval and Stage 2 hand-off | MET | RPC; `B-UI-ATOMIC-STAGE2-HANDOFF` |
| 6 | Paid AI disabled; ledger unchanged | MET | `executionEnabled=false`; 10 SETTLED, `$0.224872` |
| 7 | Production untouched | MET | no change to `platform`, `brieftick`, `www.forgeniq.com` |
| 8 | Horizon scanning live on a schedule | **PARTIAL** | **40/42** enabled, **39** with successful ingest; **`VERCEL_CRON`** 2026-11-27 **due=0**; staging **`due=1`** eCFR after seed; expect mass due **2026-11-28 04:00Z**; G2 corpus loop in progress; **unattended due>0+success OPEN-001** |
| 9 | Regulatory accuracy reviewed by an expert | **BLOCKED** | a regulatory professional must label a sample and sign off; no approval is claimed |
| 10 | Approved classification policy for each in-scope regulator | **BLOCKED** | approval needed (material classification-policy change); only REG-FCA has one |
| 11 | Hosted cross-tenant isolation | **BLOCKED** | second organisation and test users (new access: needs approval); offline RLS proof exists |
| 12 | Notifications delivered and verified | **PARTIAL** | In-app API + `#/notifications/inbox` verified; external delivery disabled by policy |
| 13 | Live AI pipeline validated on staging | **BLOCKED** | explicit authorisation and a defined spend limit for paid AI |
| 14 | Business UAT sign-off | **BLOCKED** | a named business owner must sign (`businessUatApproved=false`) |
| 15 | Data quality: DISCONNECTED obligations | **PARTIAL** | **10** synthetic pilot rows repaired; **8** legacy/partner DISCONNECTED preserved |
| 16 | Backup/restore and DR drill | **PARTIAL** | Supabase managed backup posture snapshotted; **isolated restore NOT_RUN** (ENG-OPS-001) |
| 17 | Load, performance and CPU baseline | **PARTIAL** | Sequential A/B/C dashboard + publications API latency PASS; sustained load **NOT_RUN** (ENG-OPS-002) |
| 18 | External penetration test | **BLOCKED** | third-party engagement (commercial commitment: needs approval) |
| 19 | Onboarding flow and commercial terms | NOT MET | design and approval; live billing must not be activated |
| 20 | Production deployment | **BLOCKED** | explicit approval; **not performed** |
| 21 | Reports and exports, Ask RI browser verification | **PARTIAL** | Nav **30/30**; `RI-REPORTS-OPEN-010` offline PASS; `hosted-ask-ri-browser-baseline.mjs` added (requires staging auth state); board-pack scheduling **not** verified |
| 22 | Open Medium defects (DEF-011, OPEN-007, OPEN-008) | **PARTIAL** | OPEN-007 **resolved**; OPEN-008 process; DEF-011 monitor (OPEN-009) |
