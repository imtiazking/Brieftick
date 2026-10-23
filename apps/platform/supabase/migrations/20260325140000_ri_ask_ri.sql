-- Ask RI query audit (read-only assistant)

create table public.ask_ri_query_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id text not null,
  question text not null,
  interpreted_as text,
  status text not null,
  record_count integer not null default 0,
  result_state text,
  plan_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ask_ri_query_log_org_idx on public.ask_ri_query_log (organisation_id, created_at desc);

alter table public.ask_ri_query_log enable row level security;

create policy ask_ri_query_log_select_member on public.ask_ri_query_log for select
using (public.is_active_member(organisation_id));
create policy ask_ri_query_log_insert_member on public.ask_ri_query_log for insert
with check (public.is_active_member(organisation_id));
