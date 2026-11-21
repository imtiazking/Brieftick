-- AI analysis runs are audit records: never deleted, and at most one live UC-RI-005 run per organisation.

drop policy if exists ai_analysis_runs_delete_role on public.ai_analysis_runs;
drop policy if exists ai_analysis_runs_delete_member on public.ai_analysis_runs;

create or replace function public.ri_refuse_ai_analysis_run_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('forgeniq.allow_ai_run_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'ai_analysis_runs are retained for audit and cannot be deleted'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists ri_refuse_ai_analysis_run_delete on public.ai_analysis_runs;
create trigger ri_refuse_ai_analysis_run_delete
  before delete on public.ai_analysis_runs
  for each row execute function public.ri_refuse_ai_analysis_run_delete();

create unique index if not exists ai_analysis_runs_uc_ri_005_one_running
  on public.ai_analysis_runs (organisation_id)
  where use_case_id = 'UC-RI-005' and execution_status = 'RUNNING';
