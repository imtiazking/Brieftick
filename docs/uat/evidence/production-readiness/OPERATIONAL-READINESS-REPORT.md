# Operational readiness report

## Deployment controls (verified)

- Candidate-first release: `candidate-staging.forgeniq.com` validated, then promoted within staging to `staging-app.forgeniq.com`. Official: `dpl_71M4sVFpmG4WtXiJ7uBBkUS3wnqx` (built from `782d55c`). Previous official `dpl_GVwLPEAadswJe8pSxreWZJBpjapY` retained as the rollback target; no deployment was deleted.
- QA orchestrator: promote gate **52/52**, post-deploy gate 1/1. CI catalogue: 60 entries, 45 run in CI.
- GitHub Actions: run #38 for `782d55c` succeeded. The run for `ee7ee42` is checked in the executive report.
- `platform`, `brieftick` and `www.forgeniq.com` were not touched; there was no production deployment.
- Staging migrations in this programme were additive and applied after backup or safety checks; no destructive operation was run, and historical ledger rows are unchanged.

## Components (from `/api/ri-lab/readiness`)

| Component | State | Note |
|---|---|---|
| `ai_runtime` | execution disabled | intended |
| `hosted_scheduler` | **DISABLED** | no Vercel cron configured; **release blocker** |
| `tenant_notifications` | **DISABLED** | no delivery path verified |
| Business UAT approval | `businessUatApproved=false` | requires a person |

## Horizon scanning (see `REGULATOR-CONNECTOR-STATUS.json`)

36 regulators, 41 sources, 40 connectors. **0 sources current**; 38 stale beyond 72 h; 1 failing; 1 disabled; 1 with no connector; 0 with polling enabled. Only REG-FCA has an approved classification policy. This is the central operational gap: the product's monitoring promise is not currently being met on staging.

## Reliability

Workflow recovery, duplicate-reservation refusal, numbered Stage 4 recovery and failure finalisation (`FAILED`, never `RUNNING`) are implemented and covered locally. Hosted failure injection was not run, because it needs a paid call or a destructive action.

## Not assessed

Backup and restore drill, hosted load or performance test, alerting and on-call, data retention, disaster recovery, log drains, and Vercel CPU or storage trend (an active workstream, with no measured result in this programme). Do not read the absence of these as a pass.

## Process items

Suites rewriting committed evidence (OPEN-008). A full-sweep rerun is not automated in CI.
