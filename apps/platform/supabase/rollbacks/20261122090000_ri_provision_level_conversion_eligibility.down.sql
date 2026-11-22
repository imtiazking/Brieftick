-- Rollback for 20261122090000_ri_provision_level_conversion_eligibility.sql: restores the review function from
-- 20261121180000, drops the provision guard and helper; decision columns are kept (additive, data-preserving).
drop trigger if exists ri_guard_obligation_provision on public.regulatory_obligations;
drop function if exists public.ri_guard_obligation_provision();
alter table public.ai_analysis_finding_decisions drop constraint if exists ai_analysis_finding_decisions_provision_verified;

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
  v_non_binding_labels constant text[] := array['guidance', 'consultation_proposal', 'explanatory_commentary'];
  v_dispositions constant text[] := array[
    'CONVERT_TO_DRAFT_OBLIGATION', 'LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION',
    'HORIZON_SCANNING', 'ARCHIVE', 'RECLASSIFICATION_REQUESTED'
  ];
  v_run public.ai_analysis_runs%rowtype;
  v_change public.regulatory_changes%rowtype;
  v_policy public.regulatory_classification_policies%rowtype;
  v_entry public.regulatory_classification_policy_entries%rowtype;
  v_grounding jsonb;
  v_candidates jsonb;
  v_revision text;
  v_pathway text;
  v_regulator text;
  v_publication_type text;
  v_non_binding_source boolean;
  v_total integer;
  v_items integer;
  v_matched integer;
  v_invalid integer;
  v_accepted integer[];
  v_rejected integer[];
  v_review_status text;
  v_review_id uuid;
  v_item record;
  v_n integer;
  v_labels text[];
  v_reasons text[];
  v_queue text;
  v_disposition text;
  v_supports uuid;
  v_section text;
  v_verification uuid;
  v_obligation_id uuid;
  v_skip text;
  v_created jsonb := '{}'::jsonb;
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
  v_candidates := coalesce(v_run.structured_output::jsonb -> 'candidates', '[]'::jsonb);
  if jsonb_typeof(v_candidates) <> 'array' then
    v_candidates := '[]'::jsonb;
  end if;
  v_revision := v_grounding ->> 'extractionRevisionId';
  v_pathway := case
    when v_grounding ->> 'obligationGradeSuitable' = 'true' then 'production_grounded'
    else 'human_verified_uat'
  end;
  if v_pathway = 'human_verified_uat' and p_organisation_id <> public.ri_ai_pilot_org_id() then
    raise exception 'obligation_grade_evidence_required' using errcode = '42501';
  end if;

  select r.external_key, lower(btrim(p.publication_type)) into v_regulator, v_publication_type
    from public.regulatory_publications p
    join public.regulators r on r.id = p.regulator_id
   where p.id = v_run.publication_id;
  select * into v_policy
    from public.regulatory_classification_policies p
   where p.regulator_key = v_regulator and p.status = 'ACTIVE';
  v_non_binding_source := v_publication_type = any (
    coalesce(v_policy.non_binding_publication_types, public.ri_mandatory_non_binding_publication_types())
  );

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
  if v_policy.id is null and exists (
    select 1 from jsonb_array_elements(p_decisions) e
     where e ->> 'decision' = 'ACCEPTED' or nullif(btrim(e ->> 'regulatoryClassificationCode'), '') is not null
  ) then
    raise exception 'classification_policy_unavailable' using errcode = '55000';
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

  -- Binding conversions first, so an evidential provision can reference one created in this review.
  for v_item in
    select c.id as finding_id,
           c.claim_index,
           c.claim_text,
           c.citation_status::text as citation_status,
           c.source_section_ids,
           e ->> 'decision' as decision,
           e ->> 'claimTextSha256' as claim_sha,
           nullif(btrim(e ->> 'regulatoryClassificationCode'), '') as code,
           nullif(btrim(e ->> 'disposition'), '') as disposition,
           nullif(btrim(e ->> 'legalBasis'), '') as legal_basis,
           nullif(e ->> 'quotation', '') as quotation,
           case when (e ->> 'quotationPage') ~ '^[0-9]{1,4}$' then (e ->> 'quotationPage')::integer end as quotation_page,
           nullif(btrim(e ->> 'linkedObligationId'), '') as linked_obligation,
           nullif(btrim(e ->> 'supportingObligationId'), '') as supporting_obligation,
           nullif(btrim(e ->> 'supportingFindingId'), '') as supporting_finding,
           nullif(btrim(e ->> 'reclassificationEvidence'), '') as reclassification_evidence,
           nullif(btrim(e ->> 'comment'), '') as comment
      from jsonb_array_elements(p_decisions) e
      join public.ai_analysis_citations c on c.id::text = e ->> 'findingId' and c.analysis_run_id = p_run_id
     order by coalesce(public.ri_classification_code_legal_status(nullif(btrim(e ->> 'regulatoryClassificationCode'), '')) = 'evidential', false),
              c.claim_index
  loop
    v_n := v_item.claim_index + 1;
    v_entry := null;
    v_reasons := '{}';
    v_disposition := null;
    v_supports := null;
    v_section := null;
    v_verification := null;
    v_obligation_id := null;
    v_skip := null;

    if v_item.claim_sha is distinct from encode(sha256(convert_to(v_item.claim_text, 'UTF8')), 'hex') then
      raise exception 'finding_text_mismatch:%', v_n using errcode = '22023';
    end if;
    if v_item.comment is null then
      raise exception 'finding_comment_required:%', v_n using errcode = '22023';
    end if;
    if v_item.code is not null and public.ri_classification_code_legal_status(v_item.code) is null then
      raise exception 'finding_classification_unknown:%', v_n using errcode = '22023';
    end if;
    if v_item.decision = 'ACCEPTED' and v_item.code is null then
      raise exception 'finding_classification_code_required:%', v_n using errcode = '22023';
    end if;
    if v_item.code is not null then
      select * into v_entry
        from public.regulatory_classification_policy_entries pe
       where pe.policy_id = v_policy.id and pe.code = v_item.code;
      if v_entry.id is null then
        raise exception 'finding_classification_unknown:%', v_n using errcode = '22023';
      end if;
    end if;

    select coalesce(array_agg(distinct cand ->> 'bindingNature' order by cand ->> 'bindingNature'), '{}')
      into v_labels
      from jsonb_array_elements(v_candidates) cand
     where cand ->> 'bindingNature' is not null
       and jsonb_typeof(cand -> 'sourceSectionIds') = 'array'
       and exists (
         select 1 from jsonb_array_elements_text(cand -> 'sourceSectionIds') s
          where s = any (v_item.source_section_ids)
       );

    -- Triage routing (mirrors evaluateFindingTriage; AI confidence is not an input).
    if v_entry.id is null then
      if v_item.citation_status <> 'VERIFIED' then v_reasons := array_append(v_reasons, 'unverified_citation'); end if;
      if 'binding_requirement' = any (v_labels) and v_labels && v_non_binding_labels then
        v_reasons := array_append(v_reasons, 'conflicting_classifications');
      end if;
      if not ('binding_requirement' = any (v_labels)) and not (v_labels && v_non_binding_labels) then
        v_reasons := array_append(v_reasons, 'unknown_classification');
      end if;
      if 'binding_requirement' = any (v_labels) and not (v_labels && v_non_binding_labels) and v_non_binding_source then
        v_reasons := array_append(v_reasons, 'binding_code_from_non_binding_source');
      end if;
      v_queue := case
        when cardinality(v_reasons) > 0 then 'EXCEPTION_TRIAGE'
        when 'binding_requirement' = any (v_labels) then 'OBLIGATION_TRIAGE'
        else 'NON_OBLIGATION_TRIAGE'
      end;
    elsif v_entry.code = 'UNKNOWN' then
      v_reasons := array['unknown_classification'];
      v_queue := 'EXCEPTION_TRIAGE';
    else
      if v_item.citation_status <> 'VERIFIED' then v_reasons := array_append(v_reasons, 'unverified_citation'); end if;
      if v_entry.conversion_enabled then
        if v_item.legal_basis is null or length(v_item.legal_basis) < 3 then
          v_reasons := array_append(v_reasons, 'missing_legal_basis');
        end if;
        if v_item.quotation is null or length(btrim(v_item.quotation)) < 20 or v_item.quotation_page is null then
          v_reasons := array_append(v_reasons, 'insufficient_evidence');
        end if;
        if v_non_binding_source then
          v_reasons := array_append(v_reasons, 'binding_code_from_non_binding_source');
        end if;
        if v_labels && v_non_binding_labels
           and coalesce(length(v_item.reclassification_evidence), 0) < 20 then
          v_reasons := array_append(v_reasons, 'conflicting_classifications');
        end if;
        if v_entry.supporting_obligation_link_required
           and v_item.supporting_obligation is null and v_item.supporting_finding is null then
          v_reasons := array_append(v_reasons, 'missing_binding_link');
        end if;
      end if;
      v_queue := case
        when cardinality(v_reasons) > 0 then 'EXCEPTION_TRIAGE'
        when v_entry.conversion_enabled then 'OBLIGATION_TRIAGE'
        else v_entry.destination_queue
      end;
    end if;

    if v_item.decision = 'ACCEPTED' then
      v_disposition := coalesce(
        v_item.disposition,
        case when v_entry.conversion_enabled then 'CONVERT_TO_DRAFT_OBLIGATION' else 'SUPPORTING_INFORMATION' end
      );
      if not (v_disposition = any (v_dispositions)) then
        raise exception 'finding_disposition_invalid:%', v_n using errcode = '22023';
      end if;

      if v_disposition = 'CONVERT_TO_DRAFT_OBLIGATION' then
        if v_queue <> 'OBLIGATION_TRIAGE' or not v_entry.conversion_enabled then
          raise exception '%:%',
            case v_reasons[1]
              when 'unknown_classification' then 'finding_classification_unknown'
              when 'unverified_citation' then 'finding_citation_unverified'
              when 'missing_legal_basis' then 'finding_legal_basis_required'
              when 'insufficient_evidence' then 'finding_quotation_required'
              when 'conflicting_classifications' then 'finding_classification_conflict'
              when 'binding_code_from_non_binding_source' then 'finding_source_not_binding'
              when 'missing_binding_link' then 'finding_binding_link_required'
              else 'finding_conversion_not_permitted'
            end,
            v_n using errcode = '22023';
        end if;
        select x ->> 'sourceSectionId' into v_section
          from jsonb_array_elements(coalesce(v_grounding -> 'sectionCatalog', '[]'::jsonb)) x
         where x ->> 'sourceSectionId' = any (v_item.source_section_ids)
           and x ->> 'pageNumber' = v_item.quotation_page::text
         limit 1;
        if v_section is null then
          raise exception 'finding_quotation_page_not_cited:%', v_n using errcode = '22023';
        end if;
        if v_pathway = 'human_verified_uat' and length(v_item.comment) < 20 then
          raise exception 'finding_justification_required:%', v_n using errcode = '22023';
        end if;
        if v_entry.supporting_obligation_link_required then
          if v_item.supporting_finding is not null then
            v_supports := nullif(v_created ->> v_item.supporting_finding, '')::uuid;
          elsif v_item.supporting_obligation ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select o.id into v_supports
              from public.regulatory_obligations o
             where o.id = v_item.supporting_obligation::uuid
               and o.organisation_id = p_organisation_id
               and o.metadata ->> 'legalStatus' = 'binding';
          end if;
          if v_supports is null then
            raise exception 'finding_binding_link_invalid:%', v_n using errcode = '22023';
          end if;
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
          raise exception 'finding_quotation_not_verified:%', v_n using errcode = '22023';
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
          jsonb_strip_nulls(jsonb_build_object(
            'recordProvenance', coalesce(to_jsonb(v_change) -> 'metadata' ->> 'recordProvenance', 'uat_authorised'),
            'labProvenanceLocked', true,
            'parentRegulatoryChangeId', v_change.id,
            'origin', 'AI_ASSISTED',
            'findingId', v_item.finding_id,
            'claimIndex', v_item.claim_index,
            'classification', public.ri_classification_code_finding_class(v_item.code),
            'bindingNature', public.ri_classification_code_finding_class(v_item.code),
            'regulatoryClassificationCode', v_item.code,
            'supportsObligationId', v_supports,
            'triageQueue', v_queue,
            'modelBindingLabels', to_jsonb(v_labels),
            'reclassificationEvidence', v_item.reclassification_evidence,
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
          ))
        )
        returning id into v_obligation_id;
        v_created := v_created || jsonb_build_object(v_item.finding_id::text, v_obligation_id);
      else
        if not (
          (v_queue = 'OBLIGATION_TRIAGE' and v_disposition = 'LINK_TO_EXISTING_OBLIGATION')
          or (v_queue = 'NON_OBLIGATION_TRIAGE' and v_disposition in (
                'LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION', 'HORIZON_SCANNING', 'ARCHIVE',
                'RECLASSIFICATION_REQUESTED'))
          or (v_queue = 'EXCEPTION_TRIAGE' and v_disposition in (
                'RECLASSIFICATION_REQUESTED', 'LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION', 'ARCHIVE'))
        ) then
          raise exception 'finding_disposition_not_allowed:%', v_n using errcode = '22023';
        end if;
        if v_disposition = 'LINK_TO_EXISTING_OBLIGATION' then
          if v_item.linked_obligation is null
             or v_item.linked_obligation !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             or not exists (
               select 1 from public.regulatory_obligations o
                where o.id = v_item.linked_obligation::uuid and o.organisation_id = p_organisation_id
             ) then
            raise exception 'finding_linked_obligation_required:%', v_n using errcode = '22023';
          end if;
          if not exists (
            select 1 from public.regulatory_obligations o
             where o.id = v_item.linked_obligation::uuid
               and o.metadata ->> 'legalStatus' in ('binding', 'evidential')
          ) then
            raise exception 'finding_linked_obligation_unclassified:%', v_n using errcode = '22023';
          end if;
        end if;
        v_skip := 'not_converted:' || v_disposition;
      end if;
    end if;

    insert into public.ai_analysis_finding_decisions (
      organisation_id, analysis_run_id, analysis_review_id, finding_id, claim_index, claim_text_sha256,
      decision, classification, legal_basis, verified_quotation, quotation_page, quotation_verification_id,
      reviewer_comment, evidence_pathway, obligation_id, skip_reason, reviewer_user_id,
      regulatory_classification_code, legal_status, classification_policy_id, triage_queue, exception_reasons,
      disposition, linked_obligation_id, reclassification_evidence
    ) values (
      p_organisation_id, p_run_id, v_review_id, v_item.finding_id, v_item.claim_index, v_item.claim_sha,
      v_item.decision, public.ri_classification_code_finding_class(v_item.code),
      case when v_obligation_id is not null then v_item.legal_basis end,
      case when v_obligation_id is not null then v_item.quotation end,
      case when v_obligation_id is not null then v_item.quotation_page end,
      v_verification, v_item.comment, v_pathway, v_obligation_id, v_skip, v_actor,
      v_item.code, v_entry.legal_status, v_policy.id, v_queue, v_reasons,
      v_disposition,
      case when v_disposition = 'LINK_TO_EXISTING_OBLIGATION' then v_item.linked_obligation::uuid end,
      v_item.reclassification_evidence
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
          'classification_code', v_item.code, 'legal_status', v_entry.legal_status,
          'classification_policy_version', v_policy.policy_version, 'triage_queue', v_queue,
          'evidence_pathway', v_pathway
        )
      );
      v_materialised := v_materialised || jsonb_build_object(
        'findingId', v_item.finding_id, 'claimIndex', v_item.claim_index, 'obligationId', v_obligation_id,
        'classificationCode', v_item.code, 'legalStatus', v_entry.legal_status
      );
    else
      v_skipped := v_skipped || jsonb_build_object(
        'findingId', v_item.finding_id, 'claimIndex', v_item.claim_index, 'decision', v_item.decision,
        'reason', coalesce(v_skip, 'rejected'), 'triageQueue', v_queue, 'classificationCode', v_item.code,
        'exceptionReasons', to_jsonb(v_reasons)
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
      'classification_policy_id', v_policy.id, 'classification_policy_version', v_policy.policy_version,
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
      'draft_obligations', jsonb_array_length(v_materialised), 'triaged_without_conversion', jsonb_array_length(v_skipped)
    )
  );

  return jsonb_build_object(
    'reviewId', v_review_id,
    'decision', v_review_status,
    'evidencePathway', v_pathway,
    'classificationPolicyVersion', v_policy.policy_version,
    'materialised', v_materialised,
    'skipped', v_skipped
  );
end;
$$;

comment on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) is
  'Atomic per-finding review of a UC-RI-005 run by a human reviewer (not the requester). Routes every finding to a triage queue under the active regulator classification policy; creates DRAFT obligations only for Obligation Triage findings with disposition CONVERT_TO_DRAFT_OBLIGATION and a server-verified quotation.';

revoke all on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) from public;
revoke all on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) from anon;
grant execute on function public.ri_submit_ai_finding_review(uuid, uuid, jsonb, text) to authenticated;

drop function if exists public.ri_provision_reference_core(text, text);
