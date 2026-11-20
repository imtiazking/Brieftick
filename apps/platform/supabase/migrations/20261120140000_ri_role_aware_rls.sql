-- Role-aware tenant RLS for compliance records. Mirrors lib/ri/permissions.ts so that direct
-- PostgREST / Storage access cannot exceed what the application allows:
--   VIEWER             read only; may append its own read-type audit events (Ask RI, evidence preview/download)
--   REVIEWER           AI review decisions, AI materialisation from an accepted review, and the
--                      IN_REVIEW → OPEN / DRAFT decision on AI-assisted obligations (ri_guard_role_scoped_update)
--   ANALYST            create / edit compliance records and links (unchanged application behaviour)
--   COMPLIANCE_MANAGER assurance reviews and their links
--   ADMIN / OWNER      deletes of records the application never deletes
-- SELECT policies are unchanged (active membership). workflow_events become append-only via the API.
-- service_role (server-side ingestion, notifications) bypasses RLS and is unaffected.

create or replace function public.ri_has_min_role(p_organisation_id uuid, p_min_role public.platform_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.role_rank(public.member_role(p_organisation_id)) >= public.role_rank(p_min_role), false)
$$;

comment on function public.ri_has_min_role(uuid, public.platform_role) is
  'True when the caller (Clerk JWT sub) is an active member of the organisation with at least the given role.';

-- Standard tenant tables: replace the membership-only write policies with role-aware ones.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('applicability_assessments',          'ANALYST',            'ANALYST',            'ADMIN'),
      ('impact_assessments',                 'ANALYST',            'ANALYST',            'ADMIN'),
      ('impact_assessment_business_areas',   'ANALYST',            'ANALYST',            'ANALYST'),
      ('impact_assessment_legal_entities',   'ANALYST',            'ANALYST',            'ADMIN'),
      ('impact_assessment_products',         'ANALYST',            'ANALYST',            'ADMIN'),
      ('impact_assessment_systems',          'ANALYST',            'ANALYST',            'ADMIN'),
      ('organisation_publications',          'ANALYST',            'ANALYST',            'ADMIN'),
      ('policies',                           'ANALYST',            'ANALYST',            'ADMIN'),
      ('risks',                              'ANALYST',            'ANALYST',            'ADMIN'),
      ('controls',                           'ANALYST',            'ANALYST',            'ADMIN'),
      ('actions',                            'ANALYST',            'ANALYST',            'ANALYST'),
      ('evidence_items',                     'ANALYST',            'ANALYST',            'ADMIN'),
      ('evidence_versions',                  'ANALYST',            'ANALYST',            'ANALYST'),
      ('findings',                           'ANALYST',            'ANALYST',            'ADMIN'),
      ('obligation_control_links',           'ANALYST',            'ANALYST',            'ADMIN'),
      ('obligation_policy_links',            'ANALYST',            'ANALYST',            'ANALYST'),
      ('obligation_risk_links',              'ANALYST',            'ANALYST',            'ANALYST'),
      ('risk_control_links',                 'ANALYST',            'ANALYST',            'ADMIN'),
      ('action_control_gap_links',           'ANALYST',            'ANALYST',            'ANALYST'),
      ('action_impact_assessment_links',     'ANALYST',            'ANALYST',            'ANALYST'),
      ('action_obligation_links',            'ANALYST',            'ANALYST',            'ANALYST'),
      ('action_policy_gap_links',            'ANALYST',            'ANALYST',            'ADMIN'),
      ('evidence_action_links',              'ANALYST',            'ANALYST',            'ADMIN'),
      ('evidence_control_links',             'ANALYST',            'ANALYST',            'ADMIN'),
      ('evidence_obligation_links',          'ANALYST',            'ANALYST',            'ADMIN'),
      ('evidence_regulatory_change_links',   'ANALYST',            'ANALYST',            'ADMIN'),
      ('finding_action_links',               'ANALYST',            'ANALYST',            'ADMIN'),
      ('finding_control_links',              'ANALYST',            'ANALYST',            'ADMIN'),
      ('finding_assurance_review_links',     'ANALYST',            'ANALYST',            'ADMIN'),
      ('assurance_reviews',                  'COMPLIANCE_MANAGER', 'COMPLIANCE_MANAGER', 'ADMIN'),
      ('assurance_review_control_links',     'COMPLIANCE_MANAGER', 'COMPLIANCE_MANAGER', 'ADMIN'),
      ('assurance_review_obligation_links',  'COMPLIANCE_MANAGER', 'COMPLIANCE_MANAGER', 'ADMIN'),
      ('ai_analysis_citations',              'ANALYST',            'ANALYST',            'ADMIN'),
      ('ai_analysis_runs',                   'ANALYST',            'REVIEWER',           'ANALYST'),
      ('regulatory_changes',                 null,                 'ANALYST',            'ADMIN'),
      ('regulatory_obligations',             null,                 'REVIEWER',           'ADMIN')
    ) as t(tbl, ins, upd, del)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert_member', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update_member', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete_member', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert_role', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update_role', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete_role', r.tbl);

    if r.ins is not null then
      execute format(
        'create policy %I on public.%I for insert with check (public.ri_has_min_role(organisation_id, %L::public.platform_role))',
        r.tbl || '_insert_role', r.tbl, r.ins);
    end if;
    execute format(
      'create policy %I on public.%I for update using (public.ri_has_min_role(organisation_id, %L::public.platform_role)) with check (public.ri_has_min_role(organisation_id, %L::public.platform_role))',
      r.tbl || '_update_role', r.tbl, r.upd, r.upd);
    execute format(
      'create policy %I on public.%I for delete using (public.ri_has_min_role(organisation_id, %L::public.platform_role))',
      r.tbl || '_delete_role', r.tbl, r.del);
  end loop;
end $$;

-- Changes and obligations: ANALYST creates manual records; a REVIEWER may only materialise AI-assisted
-- records (ri_guard_ai_assisted_record_insert then requires an accepted review created by the caller).
create policy regulatory_changes_insert_role on public.regulatory_changes for insert
  with check (
    public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role)
    or (origin::text = 'AI_ASSISTED' and public.ri_has_min_role(organisation_id, 'REVIEWER'::public.platform_role))
  );

create policy regulatory_obligations_insert_role on public.regulatory_obligations for insert
  with check (
    public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role)
    or (origin::text = 'AI_ASSISTED' and public.ri_has_min_role(organisation_id, 'REVIEWER'::public.platform_role))
  );

-- AI reviews and claim materialisations: REVIEWER and above insert; reviews are immutable via the API.
drop policy if exists ai_analysis_reviews_insert_member on public.ai_analysis_reviews;
drop policy if exists ai_analysis_reviews_update_member on public.ai_analysis_reviews;
drop policy if exists ai_analysis_reviews_delete_member on public.ai_analysis_reviews;
drop policy if exists ai_analysis_reviews_insert_role on public.ai_analysis_reviews;
create policy ai_analysis_reviews_insert_role on public.ai_analysis_reviews for insert
  with check (public.ri_has_min_role(organisation_id, 'REVIEWER'::public.platform_role));

drop policy if exists ai_claim_materialisations_insert_member on public.ai_claim_materialisations;
drop policy if exists ai_claim_materialisations_insert_role on public.ai_claim_materialisations;
create policy ai_claim_materialisations_insert_role on public.ai_claim_materialisations for insert
  with check (public.ri_has_min_role(organisation_id, 'REVIEWER'::public.platform_role));

-- Below ANALYST, updates are limited to the review decision itself.
create or replace function public.ri_guard_role_scoped_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
begin
  if v_actor = '' or public.ri_has_min_role(old.organisation_id, 'ANALYST'::public.platform_role) then
    return new;
  end if;

  if tg_table_name = 'regulatory_obligations' then
    if old.origin::text = 'AI_ASSISTED'
       and old.status::text = 'IN_REVIEW'
       and new.status::text in ('OPEN', 'DRAFT')
       and (to_jsonb(new) - array['status', 'updated_at', 'ai_submitted_by_user_id'])
         = (to_jsonb(old) - array['status', 'updated_at', 'ai_submitted_by_user_id']) then
      return new;
    end if;
  elsif tg_table_name = 'ai_analysis_runs' then
    if (to_jsonb(new) - array['review_status', 'updated_at']) = (to_jsonb(old) - array['review_status', 'updated_at'])
       and exists (
         select 1
           from public.ai_analysis_reviews v
          where v.analysis_run_id = new.id
            and v.organisation_id = new.organisation_id
            and v.reviewer_user_id = v_actor
            and v.decision::text = new.review_status::text
       ) then
      return new;
    end if;
  end if;

  raise exception 'insufficient_role' using errcode = '42501';
end;
$$;

drop trigger if exists ri_guard_role_scoped_update on public.regulatory_obligations;
create trigger ri_guard_role_scoped_update
  before update on public.regulatory_obligations
  for each row execute function public.ri_guard_role_scoped_update();

drop trigger if exists ri_guard_role_scoped_update on public.ai_analysis_runs;
create trigger ri_guard_role_scoped_update
  before update on public.ai_analysis_runs
  for each row execute function public.ri_guard_role_scoped_update();

-- workflow_events: append-only through the API; the actor is always the caller, and lower roles may
-- only append the event types their permitted actions produce.
drop policy if exists workflow_events_insert_member on public.workflow_events;
drop policy if exists workflow_events_update_member on public.workflow_events;
drop policy if exists workflow_events_delete_member on public.workflow_events;
drop policy if exists workflow_events_insert_actor on public.workflow_events;
create policy workflow_events_insert_actor on public.workflow_events for insert
  with check (
    actor_user_id is not null
    and actor_user_id = public.current_clerk_user_id()
    and (
      public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role)
      or (
        public.ri_has_min_role(organisation_id, 'REVIEWER'::public.platform_role)
        and event_type = any (array[
          'AI_REVIEW_ACCEPTED', 'AI_REVIEW_PARTIALLY_ACCEPTED', 'AI_REVIEW_REJECTED',
          'AI_CHANGE_MATERIALISED', 'AI_OBLIGATION_MATERIALISED', 'AI_MATERIALISATION_SKIPPED',
          'AI_MATERIALISATION_COMPLETED', 'OBLIGATION_STATUS_CHANGED'
        ])
      )
      or (
        public.ri_has_min_role(organisation_id, 'VIEWER'::public.platform_role)
        and event_type = any (array['ASK_RI_QUERY_COMPLETED', 'EVIDENCE_PREVIEWED', 'EVIDENCE_DOWNLOADED'])
      )
    )
  );

-- Ask RI query log: members log their own queries only.
drop policy if exists ask_ri_query_log_insert_member on public.ask_ri_query_log;
drop policy if exists ask_ri_query_log_insert_self on public.ask_ri_query_log;
create policy ask_ri_query_log_insert_self on public.ask_ri_query_log for insert
  with check (public.is_active_member(organisation_id) and user_id = public.current_clerk_user_id());

-- Tenant AI notification events: REVIEWER and above (the roles that request or review AI analyses).
drop policy if exists notification_events_insert_tenant_ai on public.notification_events;
create policy notification_events_insert_tenant_ai on public.notification_events for insert
  with check (
    public.is_platform_operator()
    or (
      public.has_any_active_membership()
      and payload ? 'organisation_id'
      and (payload ->> 'organisation_id') ~ '^[0-9a-f-]{36}$'
      and public.is_active_member((payload ->> 'organisation_id')::uuid)
      and (event_type)::text like 'AI_%'
      and public.ri_has_min_role((payload ->> 'organisation_id')::uuid, 'REVIEWER'::public.platform_role)
    )
  );

-- TRUNCATE ignores RLS; API roles never need it.
revoke truncate on all tables in schema public from anon, authenticated;

-- Tenant evidence files: uploads, replacements and removals need evidence:write (ANALYST).
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping ri-tenant-evidence role-aware policies';
    return;
  end if;

  execute 'drop policy if exists ri_tenant_evidence_insert_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_update_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_delete_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_insert_analyst on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_update_analyst on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_delete_analyst on storage.objects';

  execute $p$
    create policy ri_tenant_evidence_insert_analyst
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.ri_has_min_role(public.storage_tenant_evidence_org_id(name), 'ANALYST'::public.platform_role)
    )
  $p$;

  execute $p$
    create policy ri_tenant_evidence_update_analyst
    on storage.objects for update to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.ri_has_min_role(public.storage_tenant_evidence_org_id(name), 'ANALYST'::public.platform_role)
    )
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.ri_has_min_role(public.storage_tenant_evidence_org_id(name), 'ANALYST'::public.platform_role)
    )
  $p$;

  execute $p$
    create policy ri_tenant_evidence_delete_analyst
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.ri_has_min_role(public.storage_tenant_evidence_org_id(name), 'ANALYST'::public.platform_role)
    )
  $p$;
end $$;
