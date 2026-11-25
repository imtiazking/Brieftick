-- Tenant RLS for Stage 3 impact↔risk links (table added in 20261125194500).

alter table public.impact_assessment_risk_links enable row level security;

drop policy if exists impact_assessment_risk_links_select_member on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_insert_member on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_update_member on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_delete_member on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_insert_role on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_update_role on public.impact_assessment_risk_links;
drop policy if exists impact_assessment_risk_links_delete_role on public.impact_assessment_risk_links;

create policy impact_assessment_risk_links_select_member on public.impact_assessment_risk_links
  for select using (public.is_active_member(organisation_id));

create policy impact_assessment_risk_links_insert_role on public.impact_assessment_risk_links
  for insert with check (public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role));

create policy impact_assessment_risk_links_update_role on public.impact_assessment_risk_links
  for update
  using (public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role))
  with check (public.ri_has_min_role(organisation_id, 'ANALYST'::public.platform_role));

create policy impact_assessment_risk_links_delete_role on public.impact_assessment_risk_links
  for delete using (public.ri_has_min_role(organisation_id, 'ADMIN'::public.platform_role));