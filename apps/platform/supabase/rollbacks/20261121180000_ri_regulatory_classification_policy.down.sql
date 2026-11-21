-- Rollback for 20261121180000_ri_regulatory_classification_policy.sql.
-- Refuses once any finding has been triaged under a classification policy, any classified obligation exists or
-- any policy version beyond the seeded FCA v1 has been proposed: that history must not be discarded.
-- After this script, re-apply the ri_submit_ai_finding_review definition from
-- 20261121120000_ai_finding_review_draft_materialisation.sql (which re-enables guidance-on-requirement conversion)
-- and the ri_guard_role_scoped_update definition from 20261120140000_ri_role_aware_rls.sql.

do $$
begin
  if exists (select 1 from public.ai_analysis_finding_decisions where classification_policy_id is not null)
     or exists (select 1 from public.regulatory_obligations where metadata ? 'regulatoryClassificationCode')
     or exists (select 1 from public.regulatory_classification_policies where not (regulator_key = 'REG-FCA' and policy_version = 1)) then
    raise exception 'rollback_refused: classification policy history exists';
  end if;
end $$;

drop trigger if exists ri_guard_classified_obligation_status on public.regulatory_obligations;
drop function if exists public.ri_guard_classified_obligation_status();
drop trigger if exists ri_guard_obligation_classification on public.regulatory_obligations;
drop function if exists public.ri_guard_obligation_classification();
drop function if exists public.ri_authoritative_source_url_ok(text);
drop view if exists public.ri_obligation_legal_classification;

alter table public.ai_analysis_finding_decisions
  drop constraint if exists ai_analysis_finding_decisions_conversion_eligible,
  drop constraint if exists ai_analysis_finding_decisions_triaged,
  drop column if exists reclassification_evidence,
  drop column if exists linked_obligation_id,
  drop column if exists disposition,
  drop column if exists exception_reasons,
  drop column if exists triage_queue,
  drop column if exists classification_policy_id,
  drop column if exists legal_status,
  drop column if exists regulatory_classification_code;

drop function if exists public.ri_activate_classification_policy(uuid);
drop function if exists public.ri_propose_classification_policy(text, date, text[], jsonb, text);

alter table public.regulatory_classification_policy_events disable trigger ri_refuse_classification_policy_event_change;
alter table public.regulatory_classification_policy_entries disable trigger ri_guard_classification_policy_entry_change;
alter table public.regulatory_classification_policies disable trigger ri_guard_classification_policy_change;
drop table if exists public.regulatory_classification_policy_events;
drop table if exists public.regulatory_classification_policy_entries;
drop table if exists public.regulatory_classification_policies;

drop function if exists public.ri_refuse_classification_policy_event_change();
drop function if exists public.ri_guard_classification_policy_entry_change();
drop function if exists public.ri_audit_classification_policy_insert();
drop function if exists public.ri_guard_classification_policy_change();
drop function if exists public.ri_classification_policy_actor();
drop function if exists public.ri_mandatory_non_binding_publication_types();
drop function if exists public.ri_classification_code_finding_class(text);
drop function if exists public.ri_classification_code_legal_status(text);
