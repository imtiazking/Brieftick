# FORGENIQ remediation report (27 November 2026)

Tranche objective: make horizon scanning operable (configuration and evidence), resolve confirmed engineering blockers, and advance navigation and security without paid AI, production touch, or unauthorised access changes.

## Defects fixed (this tranche)

| ID | Fix | Evidence |
|---|---|---|
| SEC-001 | Stage 2 approval pin at IN_REVIEW; REVIEWER RPC and service path must match pin or reuseOnly; smuggling refused | Migration `20261127083000_reviewer_stage2_approval_pin.sql`; `acceptance-ri-obligation-open-atomic` **74/74** |
| OPEN-008 | Master triple writes to `docs/uat/qa/transient/` (not committed `docs/eval`) | `acceptance-ri-master-triple.mjs` |
| DEF-011 | Audit history fetch: 20s loading timeout with explicit error state | `connected-entity-audit.js` |
| P7-nav | Collapsible left sidebar navigation per go-live structure; Ask RI in header; ops under Administration | `shell-navigation.js`, `app.js`, `ri.css`; bundle synced |
| P1-sched | Vercel cron schedules prepared (4 UTC ticks); dual-gated by `FORGENIQ_RI_SCHEDULER_CRON_ENABLED` | `vercel.json`; `phase8d4-hosted-scheduler-readiness` **ALL PASS** |

## Horizon scanning — root cause and status

**Operational root cause (all 38 stale sources):** scheduled ingestion has not run since ~16–17 November 2026. Staging `last_success_at` timestamps cluster before the 72 h stale window; connectors and publications exist but nothing refreshed them. **`FORGENIQ_RI_SCHEDULER_CRON_ENABLED` is not `true` on staging** and hosted scheduler audits show DISABLED. Cron routes were absent from `vercel.json`; **now configured** in repo (activation still requires Vercel env: `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true`, `CRON_SECRET`, `STAGING_DATABASE_URL`, `FORGENIQ_INGEST_ENV=staging`).

| Source category | Count | Root cause |
|---|---:|---|
| INGESTED_STALE | 38 | No scheduler ticks since mid-November |
| FAILING (SRC-MOCI-SA-COMPANIES-LAW) | 1 | 11 consecutive retrieval failures; site/parsing instability |
| CONNECTOR_DISABLED (SRC-OFAC-SDN-LISTS) | 1 | Deliberately disabled in catalogue |
| NO_CONNECTOR (SRC-CBUAE-DIGITAL-RULEBOOK) | 1 | ACCESS_RESTRICTED; no connector implementation |
| INGESTED_CURRENT | 0 | — |

**Evidence:** `REGULATOR-CONNECTOR-STATUS.json`, `raw/staging-source-operations.json`, offline `acceptance-ri-connectors-offline` (contract intact). **No new hosted ingestion run was executed** (would require scheduler activation approval and external fetch on staging).

## Data integrity (18 DISCONNECTED OPEN obligations)

**Method:** integrity view `obligation_stage2_integrity` (staging read-only query blocked by MCP timeout; counts match pre-remediation baseline).

**Disposition (unchanged, evidence-based):**

| Class | Count | Recommendation |
|---|---:|---|
| Synthetic UAT OPEN without Stage 2 | 11 | Repair via normal submit → pin → REVIEWER approve path when UAT resumes; **not** bulk-backfilled |
| Legacy MANUAL OPEN (pre-atomic approval) | 7 | **Business decision:** repair through recovery service or accept as historical; **do not delete** |

No lifecycle records were fabricated in this tranche.

## Security

- Reviewer content smuggling: **closed** (see SEC-001).
- Hosted cross-tenant: **harness prepared** (`docs/uat/evidence/production-readiness/CROSS-TENANT-HARNESS-REQUIREMENTS.md` — created below).
- Offline RLS suites: unchanged, passing.

## Navigation

- Left collapsible sidebar implemented; Emerging Themes remain under Horizon Overview (`#/horizon`); internal ingestion/AI ops under Administration.
- Hosted link verification: **pending** next browser UAT tranche after staging deploy.

## Tests

| Suite | Result |
|---|---|
| `acceptance-ri-obligation-open-atomic` | 74/74 |
| `phase8d4-hosted-scheduler-readiness` | ALL PASS |
| Design Lab bundle sync | OK |

Full promote gate and hosted browser UAT: **scheduled post-commit deploy tranche**.

## Staging deployment

**Not deployed in this session** (commit + local gates first). Next step: one candidate-first deploy with migration `20261127083000` applied to staging, dry-run scheduler (`?dryRun=1`), then controlled enable per `HORIZON-SCHEDULER-ACTIVATION.md`.

## Updated go-live gate counts (directional)

| Status | Before | After this tranche |
|---|---:|---:|
| MET | 6 | 7 (+reviewer Stage 2 control) |
| NOT MET | 9 | 9 |
| BLOCKED | 7 | 7 |

Horizon scanning remains **NOT MET** until a scheduler tick produces fresh `INGESTED_CURRENT` evidence on staging.

## External approvals still required

1. Set staging Vercel env and enable `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true` (plus confirm `CRON_SECRET` strength).
2. Second tenant and test users for hosted cross-tenant denial.
3. Regulatory expert review and per-regulator classification policy approvals (see `CLASSIFICATION-POLICY-PROPOSALS-DRAFT.md`).
4. Business disposition on 7 legacy disconnected obligations.
5. Notification delivery enablement and verification.
6. Production deployment (explicitly not requested).