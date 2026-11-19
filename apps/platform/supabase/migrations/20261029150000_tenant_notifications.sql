-- Phase 83H.2 — tenant-scoped in-app notifications (no external email/SMS).
-- Local validation required before applying to shared staging.

create type public.tenant_notification_type as enum (
  'ASSIGNMENT',
  'APPROVAL_REQUEST',
  'DEADLINE',
  'TRIAGE',
  'WORKFLOW',
  'OPERATIONAL',
  'AI_REVIEW'
);

create type public.tenant_notification_severity as enum (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

create table public.tenant_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  recipient_user_id text,
  notification_type public.tenant_notification_type not null,
  severity public.tenant_notification_severity not null default 'MEDIUM',
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  link_path text,
  read_at timestamptz,
  read_by_user_id text,
  created_by_user_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tenant_notifications_org_created_idx
  on public.tenant_notifications (organisation_id, created_at desc);

create index tenant_notifications_org_unread_idx
  on public.tenant_notifications (organisation_id, recipient_user_id)
  where read_at is null;

alter table public.tenant_notifications enable row level security;

-- Inserts are application-service only (Next.js service role). Tenant JWT cannot forge notifications.
revoke insert on public.tenant_notifications from authenticated;
revoke insert on public.tenant_notifications from anon;

create policy tenant_notifications_select_member
on public.tenant_notifications
for select
using (
  public.is_active_member(organisation_id)
  and (
    recipient_user_id is null
    or recipient_user_id = public.current_clerk_user_id()
  )
);

-- No direct INSERT for tenant sessions (forgery prevention).
drop policy if exists tenant_notifications_insert_member on public.tenant_notifications;

create policy tenant_notifications_update_recipient
on public.tenant_notifications
for update
using (
  public.is_active_member(organisation_id)
  and (
    recipient_user_id is null
    or recipient_user_id = public.current_clerk_user_id()
  )
)
with check (public.is_active_member(organisation_id));

create or replace function public.tenant_notifications_before_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.organisation_id is distinct from OLD.organisation_id
     or NEW.notification_type is distinct from OLD.notification_type
     or NEW.severity is distinct from OLD.severity
     or NEW.title is distinct from OLD.title
     or NEW.message is distinct from OLD.message
     or NEW.entity_type is distinct from OLD.entity_type
     or NEW.entity_id is distinct from OLD.entity_id
     or NEW.link_path is distinct from OLD.link_path
     or NEW.recipient_user_id is distinct from OLD.recipient_user_id
     or NEW.created_by_user_id is distinct from OLD.created_by_user_id
     or NEW.payload is distinct from OLD.payload
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'tenant_notification_immutable_fields';
  end if;
  return NEW;
end;
$$;

create trigger tenant_notifications_immutable_fields
before update on public.tenant_notifications
for each row execute function public.tenant_notifications_before_update();

-- Allow tenant members to read AI in-app notification_events scoped to their organisation.
create policy notification_events_select_tenant_ai
on public.notification_events
for select
using (
  public.has_any_active_membership()
  and (payload ? 'organisation_id')
  and public.is_active_member(((payload->>'organisation_id')::uuid))
  and left(event_type::text, 3) = 'AI_'
);

comment on table public.tenant_notifications is
  'Tenant workflow notifications (in-app only). recipient_user_id null = visible to all active org members.';

-- Per-user read receipts for org-wide (broadcast) notifications.
create table public.tenant_notification_read_receipts (
  notification_id uuid not null references public.tenant_notifications (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  clerk_user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, clerk_user_id)
);

create index tenant_notification_read_receipts_org_idx
  on public.tenant_notification_read_receipts (organisation_id, clerk_user_id);

alter table public.tenant_notification_read_receipts enable row level security;

create policy tenant_notification_read_receipts_select
on public.tenant_notification_read_receipts
for select
using (
  public.is_active_member(organisation_id)
  and clerk_user_id = public.current_clerk_user_id()
);

create policy tenant_notification_read_receipts_insert
on public.tenant_notification_read_receipts
for insert
with check (
  public.is_active_member(organisation_id)
  and clerk_user_id = public.current_clerk_user_id()
);

