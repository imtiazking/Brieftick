-- Rollback for 20261120140000_ri_role_aware_rls.sql: restores the membership-only write policies
-- exactly as they were before. No table data is modified.

drop trigger if exists ri_guard_role_scoped_update on public.regulatory_obligations;
drop trigger if exists ri_guard_role_scoped_update on public.ai_analysis_runs;
drop function if exists public.ri_guard_role_scoped_update();

do $$
declare
  t text;
begin
  foreach t in array array[
    'applicability_assessments', 'impact_assessments', 'impact_assessment_business_areas',
    'impact_assessment_legal_entities', 'impact_assessment_products', 'impact_assessment_systems',
    'organisation_publications', 'policies', 'risks', 'controls', 'actions', 'evidence_items',
    'evidence_versions', 'findings', 'obligation_control_links', 'obligation_policy_links',
    'obligation_risk_links', 'risk_control_links', 'action_control_gap_links',
    'action_impact_assessment_links', 'action_obligation_links', 'action_policy_gap_links',
    'evidence_action_links', 'evidence_control_links', 'evidence_obligation_links',
    'evidence_regulatory_change_links', 'finding_action_links', 'finding_control_links',
    'finding_assurance_review_links', 'assurance_reviews', 'assurance_review_control_links',
    'assurance_review_obligation_links', 'ai_analysis_citations', 'ai_analysis_runs',
    'ai_analysis_reviews', 'regulatory_changes', 'regulatory_obligations'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_member', t);
    execute format('create policy %I on public.%I for insert with check (is_active_member(organisation_id))', t || '_insert_member', t);
    execute format('create policy %I on public.%I for update using (is_active_member(organisation_id)) with check (is_active_member(organisation_id))', t || '_update_member', t);
    execute format('create policy %I on public.%I for delete using (is_active_member(organisation_id))', t || '_delete_member', t);
  end loop;
end $$;

drop policy if exists ai_claim_materialisations_insert_role on public.ai_claim_materialisations;
drop policy if exists ai_claim_materialisations_insert_member on public.ai_claim_materialisations;
create policy ai_claim_materialisations_insert_member on public.ai_claim_materialisations for insert
  with check (is_active_member(organisation_id));

drop policy if exists workflow_events_insert_actor on public.workflow_events;
drop policy if exists workflow_events_insert_member on public.workflow_events;
drop policy if exists workflow_events_update_member on public.workflow_events;
drop policy if exists workflow_events_delete_member on public.workflow_events;
create policy workflow_events_insert_member on public.workflow_events for insert
  with check (is_active_member(organisation_id));
create policy workflow_events_update_member on public.workflow_events for update
  using (is_active_member(organisation_id)) with check (is_active_member(organisation_id));
create policy workflow_events_delete_member on public.workflow_events for delete
  using (is_active_member(organisation_id));

drop policy if exists ask_ri_query_log_insert_self on public.ask_ri_query_log;
drop policy if exists ask_ri_query_log_insert_member on public.ask_ri_query_log;
create policy ask_ri_query_log_insert_member on public.ask_ri_query_log for insert
  with check (is_active_member(organisation_id));

drop policy if exists notification_events_insert_tenant_ai on public.notification_events;
create policy notification_events_insert_tenant_ai on public.notification_events for insert
  with check (
    is_platform_operator()
    or (
      has_any_active_membership()
      and payload ? 'organisation_id'
      and (payload ->> 'organisation_id') ~ '^[0-9a-f-]{36}$'
      and is_active_member((payload ->> 'organisation_id')::uuid)
      and (event_type)::text like 'AI_%'
    )
  );

grant truncate on all tables in schema public to anon, authenticated;

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;
  execute 'drop policy if exists ri_tenant_evidence_insert_analyst on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_update_analyst on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_delete_analyst on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_insert_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_update_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_delete_member on storage.objects';
  execute $p$
    create policy ri_tenant_evidence_insert_member
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;
  execute $p$
    create policy ri_tenant_evidence_update_member
    on storage.objects for update to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;
  execute $p$
    create policy ri_tenant_evidence_delete_member
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;
end $$;

drop function if exists public.ri_has_min_role(uuid, public.platform_role);
