# Horizon scheduler activation (staging only)

Repo state after remediation: **cron schedules present** in `apps/platform/vercel.json` (00:00, 04:00, 12:00, 20:00 UTC). Execution remains **off** until env enables it.

## Preconditions

- Migration `20261127083000` applied on staging (if not already).
- `CRON_SECRET` ≥ 16 characters on Vercel staging project.
- `STAGING_DATABASE_URL` pointing to `lhgzdicffkhaaykzthep`.
- `FORGENIQ_INGEST_ENV=staging`.
- `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true`.
- Optional: `FORGENIQ_RI_SCHEDULER_BATCH_SIZE=5` (default).

## Safe sequence

1. Deploy candidate with this commit; do **not** enable flag yet.
2. `GET /api/internal/ri-ingestion/scheduler-tick?dryRun=1` with `Authorization: Bearer $CRON_SECRET` — expect due sources, no writes.
3. Enable `FORGENIQ_RI_SCHEDULER_CRON_ENABLED=true`; redeploy or wait for env propagation.
4. Monitor `HOSTED_SCHEDULER_*` audit events and `ingestion_runs` for first tick.
5. Re-run `node scripts/production-readiness/build-connector-status.mjs` with fresh staging export — expect rising `INGESTED_CURRENT` count.

## Rollback

Set `FORGENIQ_RI_SCHEDULER_CRON_ENABLED` to any value other than `true`, or remove crons block (routes then refuse ticks).