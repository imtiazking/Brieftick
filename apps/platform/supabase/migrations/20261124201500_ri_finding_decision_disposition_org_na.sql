-- Six-queue: allow ORGANISATION_NOT_APPLICABLE on persisted finding decisions (initial review path).
-- Reassessment rows were already unconstrained; this aligns ai_analysis_finding_decisions with the RPC allow-list.

alter table public.ai_analysis_finding_decisions
  drop constraint if exists ai_analysis_finding_decisions_disposition_check;

alter table public.ai_analysis_finding_decisions
  add constraint ai_analysis_finding_decisions_disposition_check check (
    disposition is null
    or disposition in (
      'CONVERT_TO_DRAFT_OBLIGATION',
      'LINK_TO_EXISTING_OBLIGATION',
      'SUPPORTING_INFORMATION',
      'HORIZON_SCANNING',
      'ARCHIVE',
      'RECLASSIFICATION_REQUESTED',
      'ORGANISATION_NOT_APPLICABLE'
    )
  );