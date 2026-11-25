-- Stage 2: one impact assessment draft per approved source obligation (idempotent downstream).

create unique index if not exists impact_assessments_source_obligation_unique_idx
  on public.impact_assessments (organisation_id, (metadata->>'sourceRegulatoryObligationId'))
  where (metadata->>'sourceRegulatoryObligationId') is not null
    and (metadata->>'sourceRegulatoryObligationId') <> '';

comment on index public.impact_assessments_source_obligation_unique_idx is
  'Prevents duplicate Stage-2 impact drafts for the same approved regulatory obligation.';