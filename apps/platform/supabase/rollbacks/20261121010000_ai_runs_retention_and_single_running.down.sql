-- Reverses 20261121010000: restores the role-aware delete policy from 20261120140000 and removes the
-- delete-refusing trigger and the one-RUNNING-UC-RI-005 index. Modifies no rows.

drop index if exists public.ai_analysis_runs_uc_ri_005_one_running;

drop trigger if exists ri_refuse_ai_analysis_run_delete on public.ai_analysis_runs;
drop function if exists public.ri_refuse_ai_analysis_run_delete();

drop policy if exists ai_analysis_runs_delete_role on public.ai_analysis_runs;
create policy ai_analysis_runs_delete_role on public.ai_analysis_runs for delete
  using (public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role));
