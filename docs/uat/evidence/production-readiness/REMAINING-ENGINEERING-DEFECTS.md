# Remaining engineering defects (vs external blockers)

**Handoff to Ask RI programme · 2026-11-27**  
Staging only · paid AI disabled · production untouched

Engineering defects are fixable in code, data (within policy), or ops automation. **Excluded** here: regulatory sign-off, commercial/legal, penetration-test procurement, second-tenant provisioning, and paid AI authorisation.

## Open engineering

| ID | Sev | Defect | Evidence | Suggested fix |
|---|---|---|---|---|
| ENG-CRON-001 | **High** | No **VERCEL_CRON** audit rows on **2026-11-27** since Tranche C re-enable (`0` since `00:00 UTC`; last historical cron `2026-11-17`) | `docs/uat/evidence/vercel-cron-2026-11-27/PRE-04UTC-SNAPSHOT.json` | Await **04:00 UTC** slot on `33d0912`; capture `RESULT.json` via `wait-vercel-cron-evidence.mjs` with DB/service-role env |
| ENG-A11Y-001 | Medium | Design Lab static acceptance: **status not colour-only (badge title)** | `operational-readiness-2026-11-27/RESULT.json` | Expose non-colour status text on badge component |
| ENG-LINEAGE-001 | Low | MOCI publication present in catalogue; **regulatory_changes** API shows `linked: false` for same id | `hosted-regulatory-lineage-verify.mjs` PASS with note | Decide if ingest-without-change-row is acceptable; else materialise change row on ingest |
| ENG-OPS-001 | Medium | Isolated backup **restore / DR drill** not executed | `backup-configuration-snapshot.json` (`restoreDrill: NOT_RUN`) | Authorised staging restore drill per Supabase runbook |
| ENG-OPS-002 | Low | Formal **load / CPU baseline** (sustained concurrency) not run | Dashboard latency PASS (&lt;30s sequential A/B/C); no k6/locust suite | Add lightweight hosted load script when authorised |
| OPEN-007 | Medium | Reviewer RPC can author DRAFT impact content (audited) | SEC-001 residual in `DEFECT-REGISTER.md` | Restrict Stage 2 content params to maker role |
| OPEN-009 | Medium | Intermittent “Loading workflow events…” on assurance (DEF-011) | Diagnostics on recurrence | Continue monitoring; no reproducible failure in Tranche D |

## Resolved in Tranche C/D (do not re-open)

- Double-hash navigation; AI Findings smoke 19/19; MOCI cert + COMPLETED ingest; 10/10 pilot DISCONNECTED repair; nav capability **30/30**; readiness API scheduler component; connector matrix **39/41 INGESTED_CURRENT**.

## External / approval blockers (not engineering defects)

| ID | Item |
|---|---|
| OPEN-002 | Regulatory expert accuracy sign-off |
| OPEN-003 | Hosted cross-tenant harness (org B, users D/E) |
| OPEN-005 | Per-regulator classification policy approvals |
| OPEN-011+ | Billing, onboarding, production deploy |
| Commercial | External penetration test engagement |