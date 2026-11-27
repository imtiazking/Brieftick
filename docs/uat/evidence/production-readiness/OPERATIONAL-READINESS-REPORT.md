# Operational readiness report

## Deployment controls (verified)

- Official staging (Tranche C/D): `staging-app.forgeniq.com` · **`dpl_9z7z4Q5aNA4UVBwyxxN2GjgvKHHK`** · git **`33d0912`** (evidence **`cbd5bfe`**). Candidate/promote flow unchanged; no deployment deleted.
- QA orchestrator: promote gate **52/52** (`a4dd45f`). CI catalogue: 60 entries, 45 run in CI.
- GitHub Actions: `forgeniq-qa` **success** on `cbd5bfe`, `33d0912`, `4a4a44a`, `a4dd45f` — `GITHUB-ACTIONS-EVIDENCE-2026-11-27.json`.
- `platform`, `brieftick` and `www.forgeniq.com` were not touched; there was no production deployment.
- Staging migrations in this programme were additive and applied after backup or safety checks; no destructive operation was run, and historical ledger rows are unchanged.

## Components (from `/api/ri-lab/readiness`)

| Component | State | Note |
|---|---|---|
| `ai_runtime` | execution disabled | intended |
| `hosted_scheduler` | **HEALTHY (historical cron)** / **DEGRADED (2026-11-27 window)** | 96 lifetime `VERCEL_CRON` audits; **0** on **2026-11-27** until first **04:00 UTC** unattended tick on `33d0912` |
| `tenant_notifications` | **DISABLED** (fan-out policy) | in-app path verified Tranche C; external delivery off |
| Business UAT approval | `businessUatApproved=false` | requires a person |

## Horizon scanning (see `REGULATOR-CONNECTOR-STATUS.json`)

36 regulators, 41 catalogue sources, 40 connectors. **39 INGESTED_CURRENT** (post-MOCI, 2026-11-27 rebuild); 0 stale; 0 failing; 1 disabled (OFAC-SDN policy); 1 without connector (CBUAE). Only REG-FCA has an approved classification policy. **Residual:** unattended `VERCEL_CRON` proof for the **2026-11-27** re-enable window (ENG-CRON-001).

## Reliability

Workflow recovery, duplicate-reservation refusal, numbered Stage 4 recovery and failure finalisation (`FAILED`, never `RUNNING`) are implemented and covered locally. Hosted failure injection was not run, because it needs a paid call or a destructive action.

## Tranche D hosted operational suite (`operational-readiness-2026-11-27/`)

| Check | Result |
|---|---|
| Concurrent authenticated users (A/B/C) | PASS |
| Dashboard latency (sequential) | PASS (&lt;30s) |
| Publications list API | PASS (&lt;20s) |
| Readiness + scheduler monitoring component | PASS |
| Scheduler offline phase8d4 | PASS |
| Browser smoke (Chromium) | PASS |
| Accessibility static acceptance | **FAIL** — ENG-A11Y-001 |
| Backup / DR | snapshot only; restore drill **NOT_RUN** |

Formal sustained load, Vercel CPU trend, and isolated restore remain **NOT RUN** (ENG-OPS-001/002).

## Process items

Suites rewriting committed evidence (OPEN-008). A full-sweep rerun is not automated in CI.
