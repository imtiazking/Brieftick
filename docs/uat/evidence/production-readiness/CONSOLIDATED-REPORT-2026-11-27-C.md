# Consolidated remediation report C (2026-11-27)

Staging only. Production untouched. Paid AI disabled.

## Deployment

| Field | Value |
|---|---|
| Official host | `https://staging-app.forgeniq.com` |
| Candidate | `https://candidate-staging.forgeniq.com` |
| **Deployment ID** | `dpl_9z7z4Q5aNA4UVBwyxxN2GjgvKHHK` |
| **Git HEAD (promoted)** | `33d09123b0a1ac91cf5ac208a1f204fc88fa33fd` |
| Mechanism | Candidate-first auth smoke → alias promote |
| Auth smoke | **19/19** pre- and post-promotion (User A AI Findings buttons **50** on official) |
| Promote gate | **52/52** (`qa:promote` on `a4dd45f` before final cert commit) |
| Rollback prior | `dpl_5ewaxbfnaa7rYfqdRrBSPz4XwQ6a` (navigation tranche) |

Evidence: `docs/eval/STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json`

## Defects closed in this tranche

| Area | Outcome |
|---|---|
| Post-promotion AI Findings / User A | Hydration wait on `[data-triage-five-decisions]`; not a capabilities defect |
| Work → Notifications `#inbox` | `sideNavHref` → `#/notifications/inbox`; legacy `#/notifications#inbox` normalised in `getRoute()` |
| Sidebar sweep honesty | Fails on **Page not found**; **32/32 PASS** on official |
| Synthetic DISCONNECTED obligations | **10/10** repaired (AI Dev tenant) via checker OPEN recovery; **8 remain** (7 legacy FORGENIQ org + 1 partner — preserved) |
| In-app notifications | `hosted-staging-notification-in-app.mjs` PASS; `externalDeliveryDisabled: true` |
| Hosted Stage 2 security | `hosted-obligation-stage2-security-regression.mjs` PASS (smuggle refused, concurrent stale, Stage 2 linked) |

## MOCI-SA / scheduler

| Item | Status |
|---|---|
| Trust chain | Copied to `apps/platform/certs/mc-gov-sa-trust-chain.pem`; connector fallback to `platform/certs/`; Vercel `includeFiles` path corrected |
| Hosted ingestion | Run `4cac5a4c-…` **COMPLETED** `2026-11-27T02:05:03Z` on `33d0912` (no ENOENT; `records_new: 0`) |
| Manual scheduler ticks | **8** `MANUAL_HOSTED` invocations since 2026-11-27 (incl. MOCI due tick `processed: 1`) |
| **VERCEL_CRON** | **0** unattended rows as of `01:50 UTC`; crons `0/4/12/20` UTC — evidence capture after **04:00 UTC** slot |

## Data integrity

| Metric | Count |
|---|---|
| `obligation_stage2_integrity` LINKED | 35 |
| DISCONNECTED (preserved legacy) | **8** (not bulk-backfilled) |

Repair evidence: `docs/uat/evidence/repair-disconnected-2026-11-27/RESULT.json`

## Still open (unchanged policy)

- Regulatory expert sign-off; second-tenant hosted negative; production deploy approval
- MOCI successful ingestion after cert deploy
- Unattended VERCEL_CRON proof (next cron window)
- GitHub Actions: `gh` CLI unavailable in agent shell — verify in UI for commits `a4dd45f` / `4a4a44a`