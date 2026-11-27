-- Horizon Scanning: tenant watchlists, consultation tracking, watchlist alert type.

do $$ begin
  alter type public.tenant_notification_type add value if not exists 'WATCHLIST';
exception
  when duplicate_object then null;
end $$;

create type public.ri_watchlist_scope as enum ('personal', 'organisation');

create type public.consultation_tracking_status as enum (
  'OPEN',
  'UNDER_REVIEW',
  'RESPONSE_IN_PROGRESS',
  'SUBMITTED',
  'CLOSED',
  'NOT_APPLICABLE'
);

create table public.ri_watchlists (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  scope public.ri_watchlist_scope not null default 'personal',
  name text not null,
  description text,
  enabled boolean not null default true,
  owner_user_id text,
  filters jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ri_watchlists_org_name_unique unique (organisation_id, name, scope, owner_user_id)
);

create index ri_watchlists_org_enabled_idx on public.ri_watchlists (organisation_id, enabled);

create table public.ri_watchlist_matches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  watchlist_id uuid not null references public.ri_watchlists (id) on delete cascade,
  publication_id uuid references public.regulatory_publications (id) on delete set null,
  regulatory_change_id uuid references public.regulatory_changes (id) on delete set null,
  obligation_id uuid references public.regulatory_obligations (id) on delete set null,
  matched_at timestamptz not null default now(),
  match_reason text not null,
  notification_id uuid references public.tenant_notifications (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  constraint ri_watchlist_matches_entity_present check (
    publication_id is not null or regulatory_change_id is not null or obligation_id is not null
  )
);

create index ri_watchlist_matches_org_watchlist_idx
  on public.ri_watchlist_matches (organisation_id, watchlist_id, matched_at desc);

create table public.organisation_consultation_tracking (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  status public.consultation_tracking_status not null default 'OPEN',
  owner_user_id text,
  internal_response_deadline date,
  internal_decision text,
  response_preparation_status text,
  submission_status text,
  organisational_relevance text,
  notes text,
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_consultation_tracking_org_pub_unique unique (organisation_id, publication_id)
);

create index organisation_consultation_tracking_org_status_idx
  on public.organisation_consultation_tracking (organisation_id, status);

alter table public.ri_watchlists enable row level security;
alter table public.ri_watchlist_matches enable row level security;
alter table public.organisation_consultation_tracking enable row level security;

create policy ri_watchlists_select on public.ri_watchlists
for select using (
  public.is_active_member(organisation_id)
  and (
    scope = 'organisation'::public.ri_watchlist_scope
    or owner_user_id is null
    or owner_user_id = public.current_clerk_user_id()
  )
);

create policy ri_watchlists_write on public.ri_watchlists
for all using (public.is_active_member(organisation_id))
with check (public.is_active_member(organisation_id));

create policy ri_watchlist_matches_select on public.ri_watchlist_matches
for select using (public.is_active_member(organisation_id));

create policy organisation_consultation_tracking_select on public.organisation_consultation_tracking
for select using (public.is_active_member(organisation_id));

create policy organisation_consultation_tracking_write on public.organisation_consultation_tracking
for all using (public.is_active_member(organisation_id))
with check (public.is_active_member(organisation_id));

create trigger ri_watchlists_set_updated_at
before update on public.ri_watchlists
for each row execute function public.set_updated_at();

create trigger organisation_consultation_tracking_set_updated_at
before update on public.organisation_consultation_tracking
for each row execute function public.set_updated_at();

comment on table public.ri_watchlists is 'Tenant horizon watchlists with JSON filters (regulators, topics, publication types).';
comment on table public.organisation_consultation_tracking is 'Per-tenant consultation workflow overlay on catalogue consultation publications.';

revoke insert, update, delete on public.ri_watchlist_matches from authenticated, anon;