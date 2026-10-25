-- Phase 8 — RI security hardening (platform operators vs tenant roles)
-- Forward-only. Do not edit prior migrations.
--
-- Rollback: restore policies from 20260323160000, 20260324170000, and identity
-- bootstrap/insert policies from 20260322140000; drop table platform_operators and
-- functions is_platform_operator, has_any_active_membership (if unused).
--
-- Authorisation model:
--   • Tenant data: organisation_memberships + is_active_member (unchanged).
--   • Global catalogue: any authenticated Clerk user (unchanged).
--   • Platform ingestion/ops: public.platform_operators allowlist only (not org roles).
--   • Org provisioning: service role / SQL bootstrap only.

-- Centrally controlled FORGENIQ platform operators (Clerk user ids)
create table public.platform_operators (
  clerk_user_id text primary key
    check (char_length(trim(clerk_user_id)) > 0),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_operators_set_updated_at
before update on public.platform_operators
for each row execute function public.set_updated_at();

alter table public.platform_operators enable row level security;

create policy platform_operators_select_self
on public.platform_operators
for select
using (
  clerk_user_id = public.current_clerk_user_id()
  and status = 'active'
);

revoke all on table public.platform_operators from public;
grant select on table public.platform_operators to authenticated;

create or replace function public.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_operators p
    where p.clerk_user_id = public.current_clerk_user_id()
      and p.status = 'active'
  );
$$;

create or replace function public.has_any_active_membership()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    where m.clerk_user_id = public.current_clerk_user_id()
      and m.status = 'active'::public.membership_status
  );
$$;

revoke all on function public.is_platform_operator() from public;
revoke all on function public.has_any_active_membership() from public;
grant execute on function public.is_platform_operator() to authenticated;
grant execute on function public.has_any_active_membership() to authenticated;

comment on table public.platform_operators is
  'FORGENIQ platform staff — global ingestion/ops authority; separate from tenant platform_role.';
comment on function public.is_platform_operator() is
  'True when JWT sub is an active platform_operators row (not derived from org membership).';

-- Ingestion runs / items / publication versions (platform operators only)
drop policy if exists ingestion_runs_select_authenticated on public.ingestion_runs;
drop policy if exists ingestion_runs_select_ingestion_ops on public.ingestion_runs;
create policy ingestion_runs_select_platform_operator
on public.ingestion_runs
for select
using (public.is_platform_operator());

drop policy if exists ingestion_items_select_authenticated on public.ingestion_items;
drop policy if exists ingestion_items_select_ingestion_ops on public.ingestion_items;
create policy ingestion_items_select_platform_operator
on public.ingestion_items
for select
using (public.is_platform_operator());

drop policy if exists regulatory_publication_versions_select_authenticated on public.regulatory_publication_versions;
drop policy if exists regulatory_publication_versions_select_ingestion_ops on public.regulatory_publication_versions;
create policy regulatory_publication_versions_select_platform_operator
on public.regulatory_publication_versions
for select
using (public.is_platform_operator());

-- Ingestion operations (platform operators only)
drop policy if exists regulatory_source_operations_select_authenticated on public.regulatory_source_operations;
drop policy if exists regulatory_source_operations_select_active_member on public.regulatory_source_operations;
create policy regulatory_source_operations_select_platform_operator
on public.regulatory_source_operations
for select
using (public.is_platform_operator());

drop policy if exists operational_alerts_select_authenticated on public.operational_alerts;
drop policy if exists operational_alerts_select_ingestion_ops on public.operational_alerts;
create policy operational_alerts_select_platform_operator
on public.operational_alerts
for select
using (public.is_platform_operator());

drop policy if exists operational_alerts_update_authenticated on public.operational_alerts;
drop policy if exists operational_alerts_update_ingestion_ops on public.operational_alerts;
create policy operational_alerts_update_platform_operator
on public.operational_alerts
for update
using (public.is_platform_operator())
with check (public.is_platform_operator());

drop policy if exists notification_events_select_authenticated on public.notification_events;
drop policy if exists notification_events_select_ingestion_ops on public.notification_events;
create policy notification_events_select_platform_operator
on public.notification_events
for select
using (public.is_platform_operator());

drop policy if exists notification_events_insert_active_member on public.notification_events;
create policy notification_events_insert_tenant_ai
on public.notification_events
for insert
with check (
  public.is_platform_operator()
  or (
    public.has_any_active_membership()
    and (payload ? 'organisation_id')
    and (payload->>'organisation_id') ~ '^[0-9a-f-]{36}$'
    and public.is_active_member(((payload->>'organisation_id')::uuid))
    and event_type::text like 'AI_%'
  )
);

drop policy if exists ingestion_operational_events_select_authenticated on public.ingestion_operational_events;
drop policy if exists ingestion_operational_events_select_ingestion_ops on public.ingestion_operational_events;
create policy ingestion_operational_events_select_platform_operator
on public.ingestion_operational_events
for select
using (public.is_platform_operator());

drop policy if exists ingestion_operational_events_insert_authenticated on public.ingestion_operational_events;
drop policy if exists ingestion_operational_events_insert_ingestion_ops on public.ingestion_operational_events;
create policy ingestion_operational_events_insert_platform_operator
on public.ingestion_operational_events
for insert
with check (public.is_platform_operator());

-- Organisation onboarding: provision via service role / controlled server jobs only
drop policy if exists organisations_insert_authenticated on public.organisations;

drop policy if exists organisation_memberships_insert_bootstrap_owner on public.organisation_memberships;
