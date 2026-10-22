-- FORGENIQ RI — RLS (membership-derived tenant access; global catalogue read-only)

alter table public.regulators enable row level security;
alter table public.regulatory_sources enable row level security;
alter table public.regulatory_publications enable row level security;

create policy regulators_select_authenticated
on public.regulators
for select
using (public.current_clerk_user_id() <> '');

create policy regulatory_sources_select_authenticated
on public.regulatory_sources
for select
using (public.current_clerk_user_id() <> '');

create policy regulatory_publications_select_authenticated
on public.regulatory_publications
for select
using (public.current_clerk_user_id() <> '');

-- Tenant tables: select/insert/update/delete require active membership
do $$
declare
  t text;
  tenant_tables text[] := array[
    'organisation_publications',
    'applicability_assessments',
    'regulatory_changes',
    'impact_assessments',
    'impact_assessment_business_areas',
    'impact_assessment_systems',
    'impact_assessment_products',
    'impact_assessment_legal_entities',
    'regulatory_obligations',
    'policies',
    'obligation_policy_links',
    'risks',
    'obligation_risk_links',
    'controls',
    'risk_control_links',
    'obligation_control_links',
    'actions',
    'action_impact_assessment_links',
    'action_obligation_links',
    'action_control_gap_links',
    'action_policy_gap_links',
    'evidence_items',
    'evidence_action_links',
    'evidence_control_links',
    'evidence_obligation_links',
    'assurance_reviews',
    'assurance_review_control_links',
    'assurance_review_obligation_links',
    'findings',
    'finding_control_links',
    'finding_action_links',
    'finding_assurance_review_links',
    'workflow_events'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select using (public.is_active_member(organisation_id))',
      t || '_select_member',
      t
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.is_active_member(organisation_id))',
      t || '_insert_member',
      t
    );
    execute format(
      'create policy %I on public.%I for update using (public.is_active_member(organisation_id)) with check (public.is_active_member(organisation_id))',
      t || '_update_member',
      t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.is_active_member(organisation_id))',
      t || '_delete_member',
      t
    );
  end loop;
end $$;
