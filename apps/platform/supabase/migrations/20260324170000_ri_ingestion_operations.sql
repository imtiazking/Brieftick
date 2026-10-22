-- FORGENIQ RI — ingestion operations, scheduling config, alerts, notifications (no production scheduler)

create type public.source_health_status as enum (
  'UNKNOWN',
  'HEALTHY',
  'DEGRADED',
  'FAILING',
  'STALE',
  'DISABLED'
);

create type public.schedule_type as enum (
  'MANUAL_ONLY',
  'INTERVAL',
  'CRON'
);

create type public.ingestion_trigger_type as enum (
  'MANUAL',
  'SCHEDULED',
  'RETRY',
  'TEST'
);

create type public.operational_alert_severity as enum (
  'INFO',
  'WARNING',
  'HIGH',
  'CRITICAL'
);

create type public.operational_alert_status as enum (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED'
);

create type public.notification_event_type as enum (
  'NEW_REGULATORY_PUBLICATION',
  'SOURCE_FAILURE',
  'SOURCE_RECOVERY',
  'INGESTION_REPEATED_FAILURE',
  'INGESTION_STALE'
);

alter type public.ingestion_run_type add value if not exists 'SCHEDULED';
alter type public.ingestion_run_type add value if not exists 'RETRY';

alter type public.ingestion_run_status add value if not exists 'QUEUED';
alter type public.ingestion_run_status add value if not exists 'SKIPPED';
alter type public.ingestion_run_status add value if not exists 'CANCELLED';

alter table public.ingestion_runs
  add column if not exists trigger_type public.ingestion_trigger_type not null default 'MANUAL',
  add column if not exists attempt_number int not null default 1,
  add column if not exists queued_at timestamptz default now(),
  add column if not exists next_retry_at timestamptz,
  add column if not exists failure_class text;

create unique index if not exists ingestion_runs_one_running_per_source
  on public.ingestion_runs (source_id)
  where status = 'RUNNING';

create table public.regulatory_source_operations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.regulatory_sources (id) on delete restrict,
  enabled boolean not null default false,
  ingestion_mode public.source_ingestion_mode not null default 'DISABLED',
  schedule_type public.schedule_type not null default 'MANUAL_ONLY',
  interval_minutes int,
  cron_expression text,
  timezone text not null default 'UTC',
  max_items_per_run int not null default 3,
  timeout_seconds int not null default 120,
  max_retries int not null default 3,
  retry_backoff_seconds int not null default 60,
  consecutive_failure_threshold int not null default 3,
  stale_after_minutes int not null default 10080,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  next_run_at timestamptz,
  consecutive_failures int not null default 0,
  health_status public.source_health_status not null default 'UNKNOWN',
  last_health_event text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_source_operations_source_unique unique (source_id)
);

create index regulatory_source_operations_next_run_idx
  on public.regulatory_source_operations (next_run_at)
  where enabled = true;

create table public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  severity public.operational_alert_severity not null default 'WARNING',
  source_id uuid references public.regulatory_sources (id) on delete set null,
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  dedupe_key text not null,
  title text not null,
  message text not null,
  status public.operational_alert_status not null default 'OPEN',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index operational_alerts_open_dedupe_idx
  on public.operational_alerts (dedupe_key)
  where status in ('OPEN', 'ACKNOWLEDGED');

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type public.notification_event_type not null,
  source_id uuid references public.regulatory_sources (id) on delete set null,
  publication_id uuid references public.regulatory_publications (id) on delete set null,
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notification_events_created_at_idx on public.notification_events (created_at desc);

create table public.ingestion_operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source_id uuid references public.regulatory_sources (id) on delete set null,
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  actor_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create trigger regulatory_source_operations_set_updated_at
before update on public.regulatory_source_operations
for each row execute function public.set_updated_at();

create trigger operational_alerts_set_updated_at
before update on public.operational_alerts
for each row execute function public.set_updated_at();

alter table public.regulatory_source_operations enable row level security;
alter table public.operational_alerts enable row level security;
alter table public.notification_events enable row level security;
alter table public.ingestion_operational_events enable row level security;

create policy regulatory_source_operations_select_authenticated
on public.regulatory_source_operations for select
using (public.current_clerk_user_id() <> '');

create policy operational_alerts_select_authenticated
on public.operational_alerts for select
using (public.current_clerk_user_id() <> '');

create policy notification_events_select_authenticated
on public.notification_events for select
using (public.current_clerk_user_id() <> '');

create policy ingestion_operational_events_select_authenticated
on public.ingestion_operational_events for select
using (public.current_clerk_user_id() <> '');

create policy operational_alerts_update_authenticated
on public.operational_alerts for update
using (public.current_clerk_user_id() <> '');

create policy ingestion_operational_events_insert_authenticated
on public.ingestion_operational_events for insert
with check (public.current_clerk_user_id() <> '');
