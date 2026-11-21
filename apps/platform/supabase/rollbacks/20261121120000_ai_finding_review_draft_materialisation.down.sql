-- Reverses 20261121120000. Refuses to run once any per-finding review exists, because dropping the
-- decision and verification tables would discard audit evidence of DRAFT obligations already created.

do $$
begin
  if exists (select 1 from public.ai_analysis_finding_decisions)
     or exists (select 1 from public.ai_finding_quotation_verifications) then
    raise exception 'rollback_refused: per-finding review evidence exists';
  end if;
end $$;

drop function if exists public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text);

drop index if exists public.ai_claim_materialisations_one_per_finding;
alter table public.ai_claim_materialisations drop column if exists finding_id;

drop table if exists public.ai_analysis_finding_decisions;
drop table if exists public.ai_finding_quotation_verifications;
drop function if exists public.ri_refuse_ai_finding_review_change();
