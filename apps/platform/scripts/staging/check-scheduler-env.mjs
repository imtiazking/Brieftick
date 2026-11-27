#!/usr/bin/env node
console.log(
  JSON.stringify({
    scheduler: process.env.FORGENIQ_RI_SCHEDULER_CRON_ENABLED,
    ingest: process.env.FORGENIQ_INGEST_ENV,
    hasCron: Boolean(process.env.CRON_SECRET?.trim()),
    cronLen: process.env.CRON_SECRET?.trim()?.length ?? 0,
    hasDb: Boolean(process.env.STAGING_DATABASE_URL?.trim()),
    ai: process.env.RI_AI_EXECUTION_ENABLED,
    batch: process.env.FORGENIQ_RI_SCHEDULER_BATCH_SIZE,
  }),
);