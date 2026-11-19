-- Phase 83H final — persist intake SLA due date on tenant organisation_publications overlay.
-- Local validation required; include in consolidated staging approval package (apply after 20261029150000).

alter table public.organisation_publications
  add column if not exists triage_sla_due timestamptz;

comment on column public.organisation_publications.triage_sla_due is
  'Target date for intake triage completion for this tenant publication overlay.';

create index if not exists organisation_publications_triage_sla_due_idx
  on public.organisation_publications (organisation_id, triage_sla_due)
  where triage_sla_due is not null;
