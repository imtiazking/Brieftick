-- SEC-DB-001 / 002 / 003 — database-level enforcement (staging + production path).

-- SEC-DB-001: finding closure requires COMPLIANCE_MANAGER (or ADMIN).
create or replace function public.ri_guard_finding_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status::text = 'CLOSED' and old.status::text is distinct from 'CLOSED' then
    if not public.ri_has_min_role(new.organisation_id, 'COMPLIANCE_MANAGER'::public.platform_role) then
      raise exception 'finding_close_requires_compliance_manager' using errcode = '42501';
    end if;
    if new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_finding_close on public.findings;
create trigger ri_guard_finding_close
  before update on public.findings
  for each row execute function public.ri_guard_finding_close();

-- SEC-DB-002: manual creator attribution.
create or replace function public.ri_guard_manual_creator_simple()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
begin
  if tg_op = 'INSERT' then
    if v_actor <> '' then
      if new.created_by_user_id is not null and new.created_by_user_id::text <> v_actor then
        raise exception 'manual_record_creator_mismatch' using errcode = '42501';
      end if;
      new.created_by_user_id := v_actor;
    elsif new.created_by_user_id is null then
      raise exception 'manual_record_creator_required' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.created_by_user_id is distinct from old.created_by_user_id then
      raise exception 'manual_record_creator_immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.ri_guard_manual_change_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
begin
  if coalesce(new.origin::text, 'MANUAL') = 'AI_ASSISTED' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if v_actor <> '' then
      if new.created_by_user_id is not null and new.created_by_user_id::text <> v_actor then
        raise exception 'manual_record_creator_mismatch' using errcode = '42501';
      end if;
      new.created_by_user_id := v_actor;
    elsif new.created_by_user_id is null then
      raise exception 'manual_record_creator_required' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.created_by_user_id is distinct from old.created_by_user_id then
      raise exception 'manual_record_creator_immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_manual_change_creator on public.regulatory_changes;
create trigger ri_guard_manual_change_creator
  before insert or update on public.regulatory_changes
  for each row execute function public.ri_guard_manual_change_creator();

alter table public.findings
  add column if not exists created_by_user_id text;

drop trigger if exists ri_guard_manual_finding_creator on public.findings;
create trigger ri_guard_manual_finding_creator
  before insert or update on public.findings
  for each row execute function public.ri_guard_manual_creator_simple();

-- obligations already guarded by ri_regulatory_classification_policy / pilot guards when classified.

alter table public.risks
  add column if not exists created_by_user_id text;

drop trigger if exists ri_guard_manual_risk_creator on public.risks;
create trigger ri_guard_manual_risk_creator
  before insert or update on public.risks
  for each row execute function public.ri_guard_manual_creator_simple();

alter table public.actions
  add column if not exists created_by_user_id text;

drop trigger if exists ri_guard_manual_action_creator on public.actions;
create trigger ri_guard_manual_action_creator
  before insert or update on public.actions
  for each row execute function public.ri_guard_manual_creator_simple();

alter table public.controls
  add column if not exists created_by_user_id text;

drop trigger if exists ri_guard_manual_control_creator on public.controls;
create trigger ri_guard_manual_control_creator
  before insert or update on public.controls
  for each row execute function public.ri_guard_manual_creator_simple();

-- SEC-DB-003: workflow_events append-only (service_role included). Break-glass: set app.audit_maint = 'authorized'.
create or replace function public.ri_guard_workflow_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.audit_maint', true), '') = 'authorized' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'workflow_events_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_workflow_events_immutable on public.workflow_events;
create trigger ri_guard_workflow_events_immutable
  before update or delete on public.workflow_events
  for each row execute function public.ri_guard_workflow_events_immutable();

revoke truncate on table public.workflow_events from authenticated, anon;