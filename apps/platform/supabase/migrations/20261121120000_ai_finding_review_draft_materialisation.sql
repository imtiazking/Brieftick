-- UC-RI-005 per-finding human review with atomic DRAFT obligation materialisation.
--
-- * Each finding is identified by its ai_analysis_citations.id (stable), never by array position, and the
--   reviewer's view of its text is pinned by sha256(claim_text).
-- * ri_submit_ai_finding_review records the review, every finding decision, the DRAFT obligations, their
--   materialisation links, the run review status and the audit events in one transaction: any failure
--   leaves none of them behind.
-- * Only explicitly accepted findings classified as binding_requirement or guidance_on_requirement become
--   obligations; permissions, scope exclusions, definitions, safe harbours, non-binding guidance and
--   explanatory statements are recorded as accepted findings only.
-- * An obligation needs an exact quotation that the server has matched against the cited page of the
--   integrity-checked primary PDF extraction (ai_finding_quotation_verifications, written by the server
--   only). When the extraction is not obligation-grade the human_verified_uat pathway applies: pilot
--   organisation only, and a reviewer justification is required.
-- * Obligations start as DRAFT. Submission and independent approval remain governed by
--   ri_guard_ai_obligation_status (approver ≠ AI requester, acceptor or submitter).
-- No existing rows are modified.

create table public.ai_finding_quotation_verifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete restrict,
  finding_id uuid not null references public.ai_analysis_citations (id) on delete restrict,
  extraction_revision_id text not null,
  page_number integer not null check (page_number > 0),
  quotation_sha256 text not null check (quotation_sha256 ~ '^[0-9a-f]{64}$'),
  page_text_sha256 text not null check (page_text_sha256 ~ '^[0-9a-f]{64}$'),
  verified_for_user_id text not null,
  created_at timestamptz not null default now()
);

comment on table public.ai_finding_quotation_verifications is
  'Server-side proof that a reviewer quotation occurs verbatim (whitespace/typography normalised) on the cited page of the primary PDF extraction. Written by the service role only.';

create index ai_finding_quotation_verifications_lookup_idx
  on public.ai_finding_quotation_verifications (analysis_run_id, finding_id, page_number);

create table public.ai_analysis_finding_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete restrict,
  analysis_review_id uuid not null references public.ai_analysis_reviews (id) on delete restrict,
  finding_id uuid not null references public.ai_analysis_citations (id) on delete restrict,
  claim_index integer not null,
  claim_text_sha256 text not null,
  decision text not null check (decision in ('ACCEPTED', 'REJECTED')),
  classification text check (
    classification is null or classification in (
      'binding_requirement', 'guidance_on_requirement', 'non_binding_guidance', 'permission',
      'scope_exclusion', 'definition', 'safe_harbour', 'explanatory_statement'
    )
  ),
  legal_basis text,
  verified_quotation text,
  quotation_page integer,
  quotation_verification_id uuid references public.ai_finding_quotation_verifications (id) on delete restrict,
  reviewer_comment text not null check (length(btrim(reviewer_comment)) > 0),
  evidence_pathway text not null check (evidence_pathway in ('production_grounded', 'human_verified_uat')),
  obligation_id uuid references public.regulatory_obligations (id) on delete restrict,
  skip_reason text,
  reviewer_user_id text not null,
  created_at timestamptz not null default now(),
  constraint ai_analysis_finding_decisions_one_per_finding unique (analysis_run_id, finding_id),
  constraint ai_analysis_finding_decisions_obligation_needs_evidence check (
    obligation_id is null
    or (
      decision = 'ACCEPTED'
      and classification in ('binding_requirement', 'guidance_on_requirement')
      and legal_basis is not null
      and verified_quotation is not null
      and quotation_page is not null
      and quotation_verification_id is not null
    )
  )
);

comment on table public.ai_analysis_finding_decisions is
  'Immutable per-finding human review decisions for UC-RI-005 runs. Written only by ri_submit_ai_finding_review.';

create index ai_analysis_finding_decisions_review_idx on public.ai_analysis_finding_decisions (analysis_review_id);

alter table public.ai_claim_materialisations
  add column if not exists finding_id uuid references public.ai_analysis_citations (id) on delete restrict;

create unique index if not exists ai_claim_materialisations_one_per_finding
  on public.ai_claim_materialisations (analysis_run_id, finding_id, entity_type)
  where finding_id is not null;

-- Read access for members; no client write policies (writes go through the function or the service role).
alter table public.ai_finding_quotation_verifications enable row level security;
alter table public.ai_analysis_finding_decisions enable row level security;

create policy ai_finding_quotation_verifications_select_member on public.ai_finding_quotation_verifications
  for select using (public.is_active_member(organisation_id));
create policy ai_analysis_finding_decisions_select_member on public.ai_analysis_finding_decisions
  for select using (public.is_active_member(organisation_id));

revoke insert, update, delete, truncate on public.ai_finding_quotation_verifications from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_analysis_finding_decisions from anon, authenticated;

create or replace function public.ri_refuse_ai_finding_review_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ai_finding_review_immutable' using errcode = '42501';
end;
$$;

create trigger ri_refuse_ai_finding_decision_change
  before update or delete on public.ai_analysis_finding_decisions
  for each row execute function public.ri_refuse_ai_finding_review_change();

create trigger ri_refuse_ai_finding_quotation_verification_change
  before update or delete on public.ai_finding_quotation_verifications
  for each row execute function public.ri_refuse_ai_finding_review_change();

create or replace function public.ri_submit_ai_finding_review(
  p_organisation_id uuid,
  p_run_id uuid,
  p_decisions jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_classes constant text[] := array[
    'binding_requirement', 'guidance_on_requirement', 'non_binding_guidance', 'permission',
    'scope_exclusion', 'definition', 'safe_harbour', 'explanatory_statement'
  ];
  v_obligation_classes constant text[] := array['binding_requirement', 'guidance_on_requirement'];
  v_run public.ai_analysis_runs%rowtype;
  v_change public.regulatory_changes%rowtype;
  v_grounding jsonb;
  v_revision text;
  v_pathway text;
  v_total integer;
  v_items integer;
  v_matched integer;
  v_invalid integer;
  v_accepted integer[];
  v_rejected integer[];
  v_review_status text;
  v_review_id uuid;
  v_item record;
  v_section text;
  v_verification uuid;
  v_obligation_id uuid;
  v_skip text;
  v_materialised jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if v_actor = '' then
    raise exception 'ai_finding_review_requires_user' using errcode = '42501';
  end if;
  if not public.ri_has_min_role(p_organisation_id, 'REVIEWER'::public.platform_role) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  select * into v_run
    from public.ai_analysis_runs r
   where r.id = p_run_id
     and r.organisation_id = p_organisation_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_run.use_case_id::text <> 'UC-RI-005' then
    raise exception 'finding_review_use_case_unsupported' using errcode = '55000';
  end if;
  if v_run.execution_status::text <> 'COMPLETED' then
    raise exception 'analysis_not_completed' using errcode = '55000';
  end if;
  if v_run.review_status::text not in ('AI_DRAFT', 'HUMAN_REVIEW_REQUIRED')
     or exists (select 1 from public.ai_analysis_reviews v where v.analysis_run_id = p_run_id) then
    raise exception 'already_reviewed' using errcode = '55000';
  end if;
  if v_run.freshness::text = 'OUTDATED' then
    raise exception 'analysis_outdated' using errcode = '55000';
  end if;
  if v_run.requested_by::text = v_actor then
    raise exception 'segregation_of_duties' using errcode = '42501';
  end if;

  v_grounding := coalesce(v_run.structured_output::jsonb -> '_forgeniqGrounding', '{}'::jsonb);
  v_revision := v_grounding ->> 'extractionRevisionId';
  v_pathway := case
    when v_grounding ->> 'obligationGradeSuitable' = 'true' then 'production_grounded'
    else 'human_verified_uat'
  end;
  if v_pathway = 'human_verified_uat' and p_organisation_id <> public.ri_ai_pilot_org_id() then
    raise exception 'obligation_grade_evidence_required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'finding_decisions_invalid' using errcode = '22023';
  end if;
  select count(*) into v_total
    from public.ai_analysis_citations c
   where c.analysis_run_id = p_run_id and c.organisation_id = p_organisation_id;
  v_items := jsonb_array_length(p_decisions);
  select count(distinct c.id) into v_matched
    from jsonb_array_elements(p_decisions) e
    join public.ai_analysis_citations c
      on c.id::text = e ->> 'findingId'
     and c.analysis_run_id = p_run_id
     and c.organisation_id = p_organisation_id;
  if v_total = 0 or v_items <> v_total or v_matched <> v_total then
    raise exception 'finding_decisions_incomplete' using errcode = '22023';
  end if;
  select count(*) into v_invalid
    from jsonb_array_elements(p_decisions) e
   where (e ->> 'decision') is null or (e ->> 'decision') not in ('ACCEPTED', 'REJECTED');
  if v_invalid > 0 then
    raise exception 'finding_decision_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(c.claim_index order by c.claim_index) filter (where e ->> 'decision' = 'ACCEPTED'), '{}'),
         coalesce(array_agg(c.claim_index order by c.claim_index) filter (where e ->> 'decision' = 'REJECTED'), '{}')
    into v_accepted, v_rejected
    from jsonb_array_elements(p_decisions) e
    join public.ai_analysis_citations c on c.id::text = e ->> 'findingId' and c.analysis_run_id = p_run_id;
  v_review_status := case
    when cardinality(v_rejected) = 0 then 'ACCEPTED'
    when cardinality(v_accepted) = 0 then 'REJECTED'
    else 'PARTIALLY_ACCEPTED'
  end;

  insert into public.ai_analysis_reviews (
    organisation_id, analysis_run_id, decision, reviewer_user_id,
    accepted_claim_indexes, rejected_claim_indexes, notes
  ) values (
    p_organisation_id, p_run_id, v_review_status::public.ai_review_status, v_actor,
    v_accepted, v_rejected, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_review_id;

  for v_item in
    select c.id as finding_id,
           c.claim_index,
           c.claim_text,
           c.citation_status::text as citation_status,
           c.source_section_ids,
           e ->> 'decision' as decision,
           e ->> 'claimTextSha256' as claim_sha,
           nullif(btrim(e ->> 'classification'), '') as classification,
           nullif(btrim(e ->> 'legalBasis'), '') as legal_basis,
           nullif(e ->> 'quotation', '') as quotation,
           case when (e ->> 'quotationPage') ~ '^[0-9]{1,4}$' then (e ->> 'quotationPage')::integer end as quotation_page,
           nullif(btrim(e ->> 'comment'), '') as comment
      from jsonb_array_elements(p_decisions) e
      join public.ai_analysis_citations c on c.id::text = e ->> 'findingId' and c.analysis_run_id = p_run_id
     order by c.claim_index
  loop
    v_section := null;
    v_verification := null;
    v_obligation_id := null;
    v_skip := null;

    if v_item.claim_sha is distinct from encode(sha256(convert_to(v_item.claim_text, 'UTF8')), 'hex') then
      raise exception 'finding_text_mismatch:%', v_item.claim_index + 1 using errcode = '22023';
    end if;
    if v_item.comment is null then
      raise exception 'finding_comment_required:%', v_item.claim_index + 1 using errcode = '22023';
    end if;

    if v_item.decision = 'ACCEPTED' then
      if v_item.classification is null or not (v_item.classification = any (v_classes)) then
        raise exception 'finding_classification_required:%', v_item.claim_index + 1 using errcode = '22023';
      end if;

      if v_item.classification = any (v_obligation_classes) then
        if v_item.citation_status <> 'VERIFIED' then
          raise exception 'finding_citation_unverified:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        if v_item.legal_basis is null or length(v_item.legal_basis) < 3 then
          raise exception 'finding_legal_basis_required:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        if v_item.quotation is null or length(btrim(v_item.quotation)) < 20 then
          raise exception 'finding_quotation_required:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        if v_item.quotation_page is null then
          raise exception 'finding_quotation_page_required:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        select x ->> 'sourceSectionId' into v_section
          from jsonb_array_elements(coalesce(v_grounding -> 'sectionCatalog', '[]'::jsonb)) x
         where x ->> 'sourceSectionId' = any (v_item.source_section_ids)
           and x ->> 'pageNumber' = v_item.quotation_page::text
         limit 1;
        if v_section is null then
          raise exception 'finding_quotation_page_not_cited:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        if v_pathway = 'human_verified_uat' and length(v_item.comment) < 20 then
          raise exception 'finding_justification_required:%', v_item.claim_index + 1 using errcode = '22023';
        end if;
        select q.id into v_verification
          from public.ai_finding_quotation_verifications q
         where q.organisation_id = p_organisation_id
           and q.analysis_run_id = p_run_id
           and q.finding_id = v_item.finding_id
           and q.page_number = v_item.quotation_page
           and q.quotation_sha256 = encode(sha256(convert_to(v_item.quotation, 'UTF8')), 'hex')
           and q.extraction_revision_id = v_revision
           and q.verified_for_user_id = v_actor
           and q.created_at > now() - interval '1 hour'
         order by q.created_at desc
         limit 1;
        if v_verification is null then
          raise exception 'finding_quotation_not_verified:%', v_item.claim_index + 1 using errcode = '22023';
        end if;

        if v_change.id is null then
          select * into v_change
            from public.regulatory_changes ch
           where ch.id::text = v_run.target_entity_id::text
             and ch.organisation_id = p_organisation_id;
          if v_change.id is null or v_change.publication_id is distinct from v_run.publication_id then
            raise exception 'obligation_extraction_parent_change_missing' using errcode = '55000';
          end if;
        end if;

        insert into public.regulatory_obligations (
          organisation_id, regulatory_change_id, publication_id, publication_version_id,
          obligation_statement, citation, source_section, status, owner_user_id, origin,
          ai_analysis_run_id, ai_analysis_review_id, created_by_user_id, metadata
        ) values (
          p_organisation_id, v_change.id, v_run.publication_id, v_run.publication_version_id,
          v_item.claim_text, 'PDF p.' || v_item.quotation_page, v_section, 'DRAFT', v_actor, 'AI_ASSISTED',
          p_run_id, v_review_id, v_actor,
          jsonb_build_object(
            'recordProvenance', coalesce(to_jsonb(v_change) -> 'metadata' ->> 'recordProvenance', 'uat_authorised'),
            'labProvenanceLocked', true,
            'parentRegulatoryChangeId', v_change.id,
            'origin', 'AI_ASSISTED',
            'findingId', v_item.finding_id,
            'claimIndex', v_item.claim_index,
            'classification', v_item.classification,
            'bindingNature', v_item.classification,
            'legalBasis', v_item.legal_basis,
            'sourceQuotation', v_item.quotation,
            'quotationPage', v_item.quotation_page,
            'sourceSectionId', v_section,
            'quotationVerificationId', v_verification,
            'pdfExtractionRevisionId', v_revision,
            'pdfGrounded', true,
            'evidencePathway', v_pathway,
            'obligationGradeSuitable', v_pathway = 'production_grounded',
            'reviewerComment', v_item.comment
          )
        )
        returning id into v_obligation_id;
      else
        v_skip := 'classification_not_obligation:' || v_item.classification;
      end if;
    end if;

    insert into public.ai_analysis_finding_decisions (
      organisation_id, analysis_run_id, analysis_review_id, finding_id, claim_index, claim_text_sha256,
      decision, classification, legal_basis, verified_quotation, quotation_page, quotation_verification_id,
      reviewer_comment, evidence_pathway, obligation_id, skip_reason, reviewer_user_id
    ) values (
      p_organisation_id, p_run_id, v_review_id, v_item.finding_id, v_item.claim_index, v_item.claim_sha,
      v_item.decision, v_item.classification, v_item.legal_basis,
      case when v_obligation_id is not null then v_item.quotation end,
      case when v_obligation_id is not null then v_item.quotation_page end,
      v_verification, v_item.comment, v_pathway, v_obligation_id, v_skip, v_actor
    );

    if v_obligation_id is not null then
      insert into public.ai_claim_materialisations (
        organisation_id, analysis_run_id, analysis_review_id, claim_index, finding_id, entity_type, entity_id
      ) values (
        p_organisation_id, p_run_id, v_review_id, v_item.claim_index, v_item.finding_id,
        'regulatory_obligation', v_obligation_id
      );
      insert into public.workflow_events (
        organisation_id, entity_type, entity_id, event_type, to_status, actor_user_id, metadata
      ) values (
        p_organisation_id, 'regulatory_obligation', v_obligation_id, 'AI_OBLIGATION_MATERIALISED', 'DRAFT', v_actor,
        jsonb_build_object(
          'origin', 'AI_ASSISTED', 'analysis_run_id', p_run_id, 'review_id', v_review_id,
          'finding_id', v_item.finding_id, 'claim_index', v_item.claim_index,
          'classification', v_item.classification, 'evidence_pathway', v_pathway
        )
      );
      v_materialised := v_materialised || jsonb_build_object(
        'findingId', v_item.finding_id, 'claimIndex', v_item.claim_index, 'obligationId', v_obligation_id
      );
    elsif v_skip is not null then
      v_skipped := v_skipped || jsonb_build_object(
        'findingId', v_item.finding_id, 'claimIndex', v_item.claim_index, 'reason', v_skip
      );
    end if;
  end loop;

  update public.ai_analysis_runs
     set review_status = v_review_status::public.ai_review_status
   where id = p_run_id and organisation_id = p_organisation_id;

  insert into public.workflow_events (
    organisation_id, entity_type, entity_id, event_type, to_status, actor_user_id, metadata
  ) values (
    p_organisation_id, 'ai_analysis_run', p_run_id, 'AI_REVIEW_' || v_review_status, v_review_status, v_actor,
    jsonb_build_object(
      'origin', 'AI_ASSISTED', 'analysis_run_id', p_run_id, 'review_id', v_review_id,
      'created_by_user_id', v_actor, 'review_mode', 'per_finding', 'evidence_pathway', v_pathway,
      'accepted_claim_indexes', to_jsonb(v_accepted), 'rejected_claim_indexes', to_jsonb(v_rejected)
    )
  );
  if jsonb_array_length(v_skipped) > 0 then
    insert into public.workflow_events (
      organisation_id, entity_type, entity_id, event_type, actor_user_id, metadata
    ) values (
      p_organisation_id, 'ai_analysis_run', p_run_id, 'AI_MATERIALISATION_SKIPPED', v_actor,
      jsonb_build_object('origin', 'AI_ASSISTED', 'review_id', v_review_id, 'skipped', v_skipped)
    );
  end if;
  insert into public.workflow_events (
    organisation_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    p_organisation_id, 'ai_analysis_run', p_run_id, 'AI_MATERIALISATION_COMPLETED', v_actor,
    jsonb_build_object(
      'origin', 'AI_ASSISTED', 'review_id', v_review_id, 'evidence_pathway', v_pathway,
      'draft_obligations', jsonb_array_length(v_materialised), 'skipped', jsonb_array_length(v_skipped)
    )
  );

  return jsonb_build_object(
    'reviewId', v_review_id,
    'decision', v_review_status,
    'evidencePathway', v_pathway,
    'materialised', v_materialised,
    'skipped', v_skipped
  );
end;
$$;

comment on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) is
  'Atomic per-finding review of a UC-RI-005 run by a human reviewer (not the requester); creates DRAFT obligations only for accepted obligation-class findings with server-verified quotations.';

revoke all on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) from public;
revoke all on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) from anon;
grant execute on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) to authenticated;
