-- FORGENIQ platform identity: organisations, memberships, RLS (Clerk sub via auth.jwt())

create extension if not exists "pgcrypto";

create type public.organisation_status as enum ('active', 'suspended', 'archived');

create type public.membership_status as enum ('active', 'invited', 'removed');

create type public.platform_role as enum (
  'OWNER',
  'ADMIN',
  'COMPLIANCE_MANAGER',
  'ANALYST',
  'REVIEWER',
  'VIEWER'
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.organisation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisations_slug_unique unique (slug)
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  clerk_user_id text not null check (char_length(trim(clerk_user_id)) > 0),
  role public.platform_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_memberships_org_user_unique unique (organisation_id, clerk_user_id)
);

create index organisation_memberships_clerk_user_id_idx
  on public.organisation_memberships (clerk_user_id);

create index organisation_memberships_organisation_id_idx
  on public.organisation_memberships (organisation_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

create trigger organisation_memberships_set_updated_at
before update on public.organisation_memberships
for each row execute function public.set_updated_at();

-- Clerk user id from Supabase third-party JWT (OIDC sub claim)
create or replace function public.current_clerk_user_id()
returns text
language sql
stable
as $$
  select coalesce(nullif(trim(auth.jwt() ->> 'sub'), ''), '');
$$;

create or replace function public.is_active_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = p_organisation_id
      and m.clerk_user_id = public.current_clerk_user_id()
      and m.status = 'active'::public.membership_status
  );
$$;

create or replace function public.member_role(p_organisation_id uuid)
returns public.platform_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organisation_memberships m
  where m.organisation_id = p_organisation_id
    and m.clerk_user_id = public.current_clerk_user_id()
    and m.status = 'active'::public.membership_status
  limit 1;
$$;

create or replace function public.role_rank(p_role public.platform_role)
returns int
language sql
immutable
as $$
  select case p_role
    when 'OWNER' then 60
    when 'ADMIN' then 50
    when 'COMPLIANCE_MANAGER' then 40
    when 'ANALYST' then 30
    when 'REVIEWER' then 20
    when 'VIEWER' then 10
    else 0
  end;
$$;

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;

-- Organisations: members only
create policy organisations_select_for_members
on public.organisations
for select
using (public.is_active_member(id));

create policy organisations_update_privileged
on public.organisations
for update
using (
  public.role_rank(public.member_role(id)) >= public.role_rank('ADMIN'::public.platform_role)
)
with check (
  public.role_rank(public.member_role(id)) >= public.role_rank('ADMIN'::public.platform_role)
);

create policy organisations_insert_authenticated
on public.organisations
for insert
with check (public.current_clerk_user_id() <> '');

-- Memberships: visible within shared organisation; mutations privileged
create policy organisation_memberships_select_same_org
on public.organisation_memberships
for select
using (public.is_active_member(organisation_id));

create policy organisation_memberships_insert_bootstrap_owner
on public.organisation_memberships
for insert
with check (
  clerk_user_id = public.current_clerk_user_id()
  and role = 'OWNER'::public.platform_role
  and not exists (
    select 1
    from public.organisation_memberships ex
    where ex.organisation_id = organisation_memberships.organisation_id
  )
);

create policy organisation_memberships_insert_privileged
on public.organisation_memberships
for insert
with check (
  public.role_rank(public.member_role(organisation_id)) >= public.role_rank('ADMIN'::public.platform_role)
  and (
    role <> 'OWNER'::public.platform_role
    or clerk_user_id = public.current_clerk_user_id()
  )
);

create policy organisation_memberships_update_privileged
on public.organisation_memberships
for update
using (
  public.role_rank(public.member_role(organisation_id)) >= public.role_rank('ADMIN'::public.platform_role)
)
with check (
  public.role_rank(public.member_role(organisation_id)) >= public.role_rank('ADMIN'::public.platform_role)
  and (
    role <> 'OWNER'::public.platform_role
    or clerk_user_id = public.current_clerk_user_id()
  )
);

create policy organisation_memberships_delete_privileged
on public.organisation_memberships
for delete
using (
  public.role_rank(public.member_role(organisation_id)) >= public.role_rank('ADMIN'::public.platform_role)
  and role <> 'OWNER'::public.platform_role
);
