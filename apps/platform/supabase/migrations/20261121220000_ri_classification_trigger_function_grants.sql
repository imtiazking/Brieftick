-- Trigger functions from 20261121180000 kept the default PUBLIC execute grant, so they were callable through
-- PostgREST (/rest/v1/rpc/...). Trigger firing does not check EXECUTE for the writing role, so revoking it
-- leaves every guarded write path unchanged. The policy RPCs and constraint helpers are not affected.

revoke all on function public.ri_guard_obligation_classification() from public, anon, authenticated;
revoke all on function public.ri_guard_classification_policy_change() from public, anon, authenticated;
revoke all on function public.ri_guard_classification_policy_entry_change() from public, anon, authenticated;
revoke all on function public.ri_audit_classification_policy_insert() from public, anon, authenticated;
revoke all on function public.ri_refuse_classification_policy_event_change() from public, anon, authenticated;
