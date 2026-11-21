-- Read-only remediation audit: every regulatory obligation evaluated against the FCA classification policy v1.
-- SELECT only. Works before or after migration 20261121180000 (does not depend on the new objects).
with non_binding_types(t) as (
  values ('finalised_guidance'), ('guidance'), ('consultation_paper'), ('discussion_paper'),
         ('feedback_statement'), ('news'), ('press_release'), ('speech')
),
binding_codes(code, legal_status) as (
  values ('R', 'binding'), ('E', 'evidential'), ('D', 'binding'), ('P', 'binding'),
         ('UK', 'binding'), ('EU', 'binding'), ('TS', 'binding')
),
base as (
  select
    o.id,
    org.name as organisation,
    o.origin::text as origin,
    o.status::text as status,
    left(o.obligation_statement, 90) as statement,
    o.citation,
    o.source_section,
    p.title as publication,
    lower(p.publication_type) as publication_type,
    r.external_key as regulator,
    o.metadata ->> 'findingId' as finding_id,
    o.metadata ->> 'claimIndex' as claim_index,
    nullif(o.metadata ->> 'regulatoryClassificationCode', '') as code,
    coalesce(o.metadata ->> 'classification', o.metadata ->> 'bindingNature') as legacy_classification,
    o.metadata ->> 'legalBasis' as legal_basis,
    (o.metadata ? 'sourceQuotation') as has_quotation,
    o.created_at
  from public.regulatory_obligations o
  join public.organisations org on org.id = o.organisation_id
  left join public.regulatory_publications p on p.id = o.publication_id
  left join public.regulators r on r.id = p.regulator_id
)
select
  b.*,
  case
    when b.code is null then 'UNCLASSIFIED'
    when bc.code is null then 'NOT_CONVERSION_ELIGIBLE'
    when b.publication_type in (select t from non_binding_types) then 'NON_BINDING_SOURCE'
    else 'VALID'
  end as policy_assessment,
  case
    when b.code is not null and bc.code is not null and b.publication_type not in (select t from non_binding_types) then false
    else true
  end as remediation_required,
  case
    when b.publication_type in (select t from non_binding_types) then 'Source publication is non-binding; review whether a binding provision exists, otherwise reclassify as supporting information'
    when b.code is null and b.origin = 'MANUAL' then 'Manual obligation with no classification; assign a code and legal basis or mark supporting'
    when b.code is null then 'AI obligation with no classification; route to Exception Triage'
    when bc.code is null then 'Code not conversion-eligible; convert to supporting record'
    else 'No action'
  end as recommended_action
from base b
left join binding_codes bc on bc.code = b.code
order by b.organisation, b.publication, b.created_at;
