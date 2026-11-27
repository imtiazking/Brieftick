-- Staging-safe catalogue seed: eCFR Title 12 versioner API source (REG-FRB).

insert into public.regulatory_sources (
  external_key,
  regulator_id,
  name,
  source_type,
  canonical_url,
  jurisdiction,
  catalogue_status,
  verification_status,
  coverage_verification_status,
  production_status,
  production_strategy,
  content_classes,
  ri_uses,
  ingestion_mode
)
select
  'SRC-ECFR-TITLE-12',
  r.id,
  'Board of Governors of the Federal Reserve System — SRC-ECFR-TITLE-12',
  'Code of Federal Regulations Title 12 (versioner API)',
  'https://www.ecfr.gov/api/versioner/v1/titles.json',
  'United States',
  'PLANNED'::public.catalogue_lifecycle_status,
  'LIVE_VERIFIED'::public.integration_verification_status,
  'PARTIALLY_VERIFIED'::public.coverage_verification_status,
  'NOT_ENABLED'::public.production_source_status,
  'OFFICIAL_STRUCTURED_ENDPOINT',
  array['RULE', 'GUIDANCE', 'OTHER']::text[],
  array['HORIZON_SCANNING', 'REFERENCE_ONLY', 'GUIDANCE_MONITORING']::text[],
  'ENABLED'::public.source_ingestion_mode
from public.regulators r
where r.external_key = 'REG-FRB'
on conflict (external_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  canonical_url = excluded.canonical_url,
  jurisdiction = excluded.jurisdiction,
  catalogue_status = excluded.catalogue_status,
  verification_status = excluded.verification_status,
  coverage_verification_status = excluded.coverage_verification_status,
  production_status = excluded.production_status,
  production_strategy = excluded.production_strategy,
  content_classes = excluded.content_classes,
  ri_uses = excluded.ri_uses,
  ingestion_mode = excluded.ingestion_mode,
  updated_at = now();

insert into public.regulatory_source_operations (
  source_id,
  enabled,
  ingestion_mode,
  schedule_type,
  interval_minutes,
  timezone,
  max_items_per_run,
  timeout_seconds,
  max_retries,
  retry_backoff_seconds,
  consecutive_failure_threshold,
  stale_after_minutes,
  health_status,
  next_run_at
)
select
  rs.id,
  true,
  'ENABLED'::public.source_ingestion_mode,
  'INTERVAL'::public.schedule_type,
  1440,
  'UTC',
  3,
  120,
  3,
  60,
  3,
  10080,
  'UNKNOWN'::public.source_health_status,
  now() - interval '5 minutes'
from public.regulatory_sources rs
where rs.external_key = 'SRC-ECFR-TITLE-12'
on conflict (source_id) do update set
  enabled = excluded.enabled,
  ingestion_mode = excluded.ingestion_mode,
  schedule_type = excluded.schedule_type,
  interval_minutes = excluded.interval_minutes,
  max_items_per_run = excluded.max_items_per_run,
  next_run_at = coalesce(regulatory_source_operations.last_success_at, now() - interval '5 minutes'),
  updated_at = now();