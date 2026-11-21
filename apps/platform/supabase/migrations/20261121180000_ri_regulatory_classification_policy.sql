-- Regulatory classification policy, finding triage queues and backend obligation conversion eligibility.
--
-- * A canonical classification vocabulary with a fixed legal status per code
--   (ri_classification_code_legal_status). Regulator policies are versioned configuration over that vocabulary:
--   they may describe, route and switch conversion OFF, but table constraints refuse conversion for any code
--   whose legal status is not binding or evidential, refuse dropping the mandatory non-binding publication
--   types, require human review for convertible codes, require a supporting binding link for evidential
--   provisions and always route UNKNOWN to Exception Triage.
-- * Policies are written only by platform operators through ri_propose_classification_policy and activated by a
--   different operator through ri_activate_classification_policy; activated versions are immutable and every
--   change is recorded in regulatory_classification_policy_events. The FCA v1 policy is seeded here.
-- * ri_submit_ai_finding_review is replaced: every finding is routed to Obligation, Non-Obligation or Exception
--   Triage, and only an accepted finding in Obligation Triage with disposition CONVERT_TO_DRAFT_OBLIGATION
--   becomes a DRAFT obligation. Guidance on binding requirements is no longer convertible. AI confidence is
--   never read.
-- * ri_guard_obligation_classification refuses every new obligation (AI-assisted or manual, including direct
--   API inserts) without a code that is convertible under the active policy for the publication's regulator,
--   and stamps the legal status for reporting. Manual obligations must also start DRAFT, record their creator,
--   carry a legal basis and an authoritative provision (reference, quotation and an official source URL —
--   never guidance text), and then pass the same maker-checker approval as AI obligations
--   (ri_guard_classified_obligation_status). Classification metadata cannot be edited afterwards. Existing
--   unclassified obligations are untouched and reported as classification_review_required.
-- Additive only: no existing rows are modified; new constraints on existing tables are NOT VALID.

create or replace function public.ri_classification_code_legal_status(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'R' then 'binding' when 'D' then 'binding' when 'P' then 'binding'
    when 'UK' then 'binding' when 'EU' then 'binding' when 'TS' then 'binding'
    when 'E' then 'evidential'
    when 'G' then 'non_binding' when 'C' then 'non_binding' when 'GBR' then 'non_binding'
    when 'REC' then 'non_binding' when 'NBE' then 'non_binding' when 'CONS' then 'non_binding'
    when 'PERM' then 'non_binding' when 'EXEMPT' then 'non_binding' when 'SH' then 'non_binding'
    when 'GP' then 'non_binding'
    when 'DEF' then 'interpretive' when 'EXPL' then 'interpretive'
    when 'REPEALED' then 'repealed'
    when 'UNKNOWN' then 'unknown'
  end
$$;

create or replace function public.ri_classification_code_finding_class(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_code in ('R', 'E', 'D', 'P', 'UK', 'EU', 'TS') then 'binding_requirement'
    when p_code = 'GBR' then 'guidance_on_requirement'
    when p_code in ('G', 'C', 'REC', 'NBE', 'CONS', 'GP') then 'non_binding_guidance'
    when p_code = 'PERM' then 'permission'
    when p_code = 'EXEMPT' then 'scope_exclusion'
    when p_code = 'DEF' then 'definition'
    when p_code = 'SH' then 'safe_harbour'
    when p_code = 'EXPL' then 'explanatory_statement'
  end
$$;

create or replace function public.ri_mandatory_non_binding_publication_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['finalised_guidance', 'guidance', 'consultation_paper', 'discussion_paper',
               'feedback_statement', 'news', 'press_release', 'speech']::text[]
$$;

create table public.regulatory_classification_policies (
  id uuid primary key default gen_random_uuid(),
  regulator_key text not null,
  policy_version integer not null check (policy_version > 0),
  effective_from date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN')),
  non_binding_publication_types text[] not null,
  change_reason text not null check (length(btrim(change_reason)) >= 10),
  created_by_user_id text not null check (length(btrim(created_by_user_id)) > 0),
  approved_by_user_id text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint regulatory_classification_policies_version_unique unique (regulator_key, policy_version),
  constraint regulatory_classification_policies_publication_floor
    check (non_binding_publication_types @> public.ri_mandatory_non_binding_publication_types()),
  constraint regulatory_classification_policies_approved
    check (status not in ('ACTIVE', 'SUPERSEDED') or (approved_by_user_id is not null and approved_at is not null)),
  constraint regulatory_classification_policies_maker_checker
    check (approved_by_user_id is null or approved_by_user_id <> created_by_user_id)
);

create unique index regulatory_classification_policies_one_active
  on public.regulatory_classification_policies (regulator_key) where status = 'ACTIVE';

comment on table public.regulatory_classification_policies is
  'Versioned regulator-specific classification policy. Platform-operator maker-checker; immutable once activated.';

create table public.regulatory_classification_policy_entries (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.regulatory_classification_policies (id) on delete restrict,
  code text not null check (public.ri_classification_code_legal_status(code) is not null),
  description text not null check (length(btrim(description)) > 0),
  legal_status text not null,
  conversion_enabled boolean not null,
  destination_queue text not null
    check (destination_queue in ('OBLIGATION_TRIAGE', 'NON_OBLIGATION_TRIAGE', 'EXCEPTION_TRIAGE')),
  human_review_required boolean not null default true,
  supporting_obligation_link_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint regulatory_classification_policy_entries_one_per_code unique (policy_id, code),
  constraint regulatory_classification_policy_entries_legal_status_fixed
    check (legal_status = public.ri_classification_code_legal_status(code)),
  constraint regulatory_classification_policy_entries_conversion_legal
    check (not conversion_enabled or (
      legal_status in ('binding', 'evidential')
      and destination_queue = 'OBLIGATION_TRIAGE'
      and human_review_required
    )),
  constraint regulatory_classification_policy_entries_queue_matches
    check (conversion_enabled or destination_queue <> 'OBLIGATION_TRIAGE'),
  constraint regulatory_classification_policy_entries_evidential_link
    check (legal_status <> 'evidential' or supporting_obligation_link_required),
  constraint regulatory_classification_policy_entries_unknown_blocked
    check (code <> 'UNKNOWN' or (not conversion_enabled and destination_queue = 'EXCEPTION_TRIAGE'))
);

comment on table public.regulatory_classification_policy_entries is
  'Per-code configuration of a classification policy. Legal status is fixed by the canonical vocabulary.';

create table public.regulatory_classification_policy_events (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.regulatory_classification_policies (id) on delete restrict,
  event_type text not null,
  actor text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index regulatory_classification_policy_events_policy_idx
  on public.regulatory_classification_policy_events (policy_id, created_at);

comment on table public.regulatory_classification_policy_events is
  'Append-only audit history of classification policy changes.';

alter table public.regulatory_classification_policies enable row level security;
alter table public.regulatory_classification_policy_entries enable row level security;
alter table public.regulatory_classification_policy_events enable row level security;

create policy regulatory_classification_policies_read on public.regulatory_classification_policies
  for select to authenticated using (true);
create policy regulatory_classification_policy_entries_read on public.regulatory_classification_policy_entries
  for select to authenticated using (true);
create policy regulatory_classification_policy_events_read on public.regulatory_classification_policy_events
  for select to authenticated using (public.is_platform_operator());

revoke insert, update, delete, truncate on public.regulatory_classification_policies from anon, authenticated;
revoke insert, update, delete, truncate on public.regulatory_classification_policy_entries from anon, authenticated;
revoke insert, update, delete, truncate on public.regulatory_classification_policy_events from anon, authenticated;
revoke select on public.regulatory_classification_policy_events from anon;
grant select on public.regulatory_classification_policies to authenticated;
grant select on public.regulatory_classification_policy_entries to authenticated;
grant select on public.regulatory_classification_policy_events to authenticated;

create or replace function public.ri_classification_policy_actor()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(public.current_clerk_user_id(), ''), 'db:' || current_user)
$$;

create or replace function public.ri_guard_classification_policy_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'classification_policy_immutable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if (new.regulator_key, new.policy_version, new.effective_from, new.non_binding_publication_types,
        new.change_reason, new.created_by_user_id, new.created_at)
       is distinct from
       (old.regulator_key, old.policy_version, old.effective_from, old.non_binding_publication_types,
        old.change_reason, old.created_by_user_id, old.created_at) then
      raise exception 'classification_policy_immutable' using errcode = '42501';
    end if;
    if not ((old.status = 'DRAFT' and new.status in ('ACTIVE', 'WITHDRAWN'))
            or (old.status = 'ACTIVE' and new.status = 'SUPERSEDED')) then
      raise exception 'classification_policy_transition_invalid' using errcode = '42501';
    end if;
    if old.status <> 'DRAFT'
       and (new.approved_by_user_id, new.approved_at) is distinct from (old.approved_by_user_id, old.approved_at) then
      raise exception 'classification_policy_immutable' using errcode = '42501';
    end if;
    if new.status = 'ACTIVE' and not exists (
      select 1 from public.regulatory_classification_policy_entries e
       where e.policy_id = new.id and e.code = 'UNKNOWN'
    ) then
      raise exception 'classification_policy_unknown_entry_required' using errcode = '23514';
    end if;
    insert into public.regulatory_classification_policy_events (policy_id, event_type, actor, detail)
    values (new.id, 'POLICY_' || new.status, public.ri_classification_policy_actor(),
            jsonb_build_object('from_status', old.status, 'to_status', new.status,
                               'approved_by_user_id', new.approved_by_user_id));
  else
    if new.status <> 'DRAFT' then
      raise exception 'classification_policy_must_start_draft' using errcode = '42501';
    end if;
    new.non_binding_publication_types := (
      select array_agg(distinct lower(btrim(t)) order by lower(btrim(t)))
        from unnest(new.non_binding_publication_types) t
    );
  end if;
  return new;
end;
$$;

create or replace function public.ri_audit_classification_policy_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.regulatory_classification_policy_events (policy_id, event_type, actor, detail)
  values (new.id, 'POLICY_PROPOSED', public.ri_classification_policy_actor(),
          jsonb_build_object('regulator_key', new.regulator_key, 'policy_version', new.policy_version,
                             'effective_from', new.effective_from, 'change_reason', new.change_reason,
                             'non_binding_publication_types', to_jsonb(new.non_binding_publication_types)));
  return new;
end;
$$;

create or replace function public.ri_guard_classification_policy_entry_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_policy uuid := case when tg_op = 'DELETE' then old.policy_id else new.policy_id end;
  v_status text;
begin
  select p.status into v_status from public.regulatory_classification_policies p where p.id = v_policy;
  if v_status is distinct from 'DRAFT' or (tg_op = 'UPDATE' and new.policy_id <> old.policy_id) then
    raise exception 'classification_policy_immutable' using errcode = '42501';
  end if;
  insert into public.regulatory_classification_policy_events (policy_id, event_type, actor, detail)
  values (v_policy, 'ENTRY_' || tg_op, public.ri_classification_policy_actor(),
          case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.ri_refuse_classification_policy_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'classification_policy_events_append_only' using errcode = '42501';
end;
$$;

create trigger ri_guard_classification_policy_change
  before insert or update or delete on public.regulatory_classification_policies
  for each row execute function public.ri_guard_classification_policy_change();
create trigger ri_audit_classification_policy_insert
  after insert on public.regulatory_classification_policies
  for each row execute function public.ri_audit_classification_policy_insert();
create trigger ri_guard_classification_policy_entry_change
  before insert or update or delete on public.regulatory_classification_policy_entries
  for each row execute function public.ri_guard_classification_policy_entry_change();
create trigger ri_refuse_classification_policy_event_change
  before update or delete on public.regulatory_classification_policy_events
  for each row execute function public.ri_refuse_classification_policy_event_change();

create or replace function public.ri_propose_classification_policy(
  p_regulator_key text,
  p_effective_from date,
  p_non_binding_publication_types text[],
  p_entries jsonb,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_version integer;
  v_id uuid;
begin
  if v_actor = '' or not public.is_platform_operator() then
    raise exception 'classification_policy_operator_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'classification_policy_entries_required' using errcode = '22023';
  end if;
  select coalesce(max(p.policy_version), 0) + 1 into v_version
    from public.regulatory_classification_policies p
   where p.regulator_key = btrim(p_regulator_key);
  insert into public.regulatory_classification_policies (
    regulator_key, policy_version, effective_from, non_binding_publication_types, change_reason, created_by_user_id
  ) values (
    btrim(p_regulator_key), v_version, p_effective_from,
    coalesce(p_non_binding_publication_types, '{}') || public.ri_mandatory_non_binding_publication_types(),
    p_change_reason, v_actor
  )
  returning id into v_id;
  insert into public.regulatory_classification_policy_entries (
    policy_id, code, description, legal_status, conversion_enabled, destination_queue,
    human_review_required, supporting_obligation_link_required
  )
  select v_id,
         e ->> 'code',
         e ->> 'description',
         public.ri_classification_code_legal_status(e ->> 'code'),
         coalesce((e ->> 'conversionEnabled')::boolean, false),
         e ->> 'destinationQueue',
         coalesce((e ->> 'humanReviewRequired')::boolean, true),
         coalesce((e ->> 'supportingObligationLinkRequired')::boolean, false)
    from jsonb_array_elements(p_entries) e;
  return v_id;
end;
$$;

create or replace function public.ri_activate_classification_policy(p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_policy public.regulatory_classification_policies%rowtype;
begin
  if v_actor = '' or not public.is_platform_operator() then
    raise exception 'classification_policy_operator_required' using errcode = '42501';
  end if;
  select * into v_policy from public.regulatory_classification_policies p where p.id = p_policy_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_policy.status <> 'DRAFT' then
    raise exception 'classification_policy_transition_invalid' using errcode = '42501';
  end if;
  if v_policy.created_by_user_id = v_actor then
    raise exception 'segregation_of_duties' using errcode = '42501';
  end if;
  if v_policy.effective_from > current_date then
    raise exception 'classification_policy_not_yet_effective' using errcode = '55000';
  end if;
  update public.regulatory_classification_policies
     set status = 'SUPERSEDED'
   where regulator_key = v_policy.regulator_key and status = 'ACTIVE';
  update public.regulatory_classification_policies
     set status = 'ACTIVE', approved_by_user_id = v_actor, approved_at = now()
   where id = p_policy_id;
end;
$$;

revoke all on function public.ri_propose_classification_policy(text, date, text[], jsonb, text) from public, anon;
revoke all on function public.ri_activate_classification_policy(uuid) from public, anon;
grant execute on function public.ri_propose_classification_policy(text, date, text[], jsonb, text) to authenticated;
grant execute on function public.ri_activate_classification_policy(uuid) to authenticated;

-- FCA v1 (reference configuration; activation recorded as migration review rather than an operator session).
do $$
declare
  v_id uuid;
begin
  insert into public.regulatory_classification_policies (
    regulator_key, policy_version, effective_from, non_binding_publication_types, change_reason, created_by_user_id
  ) values (
    'REG-FCA', 1, date '2026-11-21', public.ri_mandatory_non_binding_publication_types(),
    'Initial FCA classification policy: only binding and evidential provisions are eligible for DRAFT obligation conversion.',
    'system:migration_20261121180000'
  )
  returning id into v_id;

  insert into public.regulatory_classification_policy_entries (
    policy_id, code, description, legal_status, conversion_enabled, destination_queue, human_review_required,
    supporting_obligation_link_required
  )
  select v_id, x.code, x.description, public.ri_classification_code_legal_status(x.code), x.conversion,
         x.queue, true, x.code = 'E'
    from (values
      ('R', 'Rule', true, 'OBLIGATION_TRIAGE'),
      ('E', 'Evidential provision (must be linked to the binding provision it evidences)', true, 'OBLIGATION_TRIAGE'),
      ('D', 'Direction', true, 'OBLIGATION_TRIAGE'),
      ('P', 'Principle', true, 'OBLIGATION_TRIAGE'),
      ('UK', 'UK legislation', true, 'OBLIGATION_TRIAGE'),
      ('EU', 'Applicable EU legislation', true, 'OBLIGATION_TRIAGE'),
      ('TS', 'Binding technical standards', true, 'OBLIGATION_TRIAGE'),
      ('G', 'Guidance', false, 'NON_OBLIGATION_TRIAGE'),
      ('C', 'Conduct — market abuse conclusive provisions (FCA Handbook MAR); binding conduct rules are R', false, 'NON_OBLIGATION_TRIAGE'),
      ('GBR', 'Guidance on binding requirements', false, 'NON_OBLIGATION_TRIAGE'),
      ('REC', 'Recommendations', false, 'NON_OBLIGATION_TRIAGE'),
      ('NBE', 'Non-binding expectations', false, 'NON_OBLIGATION_TRIAGE'),
      ('CONS', 'Consultation proposals', false, 'NON_OBLIGATION_TRIAGE'),
      ('PERM', 'Permissions', false, 'NON_OBLIGATION_TRIAGE'),
      ('DEF', 'Definitions', false, 'NON_OBLIGATION_TRIAGE'),
      ('EXEMPT', 'Exemptions', false, 'NON_OBLIGATION_TRIAGE'),
      ('SH', 'Safe harbours', false, 'NON_OBLIGATION_TRIAGE'),
      ('GP', 'Good practice', false, 'NON_OBLIGATION_TRIAGE'),
      ('EXPL', 'Explanatory statements', false, 'NON_OBLIGATION_TRIAGE'),
      ('REPEALED', 'Repealed requirements', false, 'NON_OBLIGATION_TRIAGE'),
      ('UNKNOWN', 'Unknown classification', false, 'EXCEPTION_TRIAGE')
    ) as x(code, description, conversion, queue);

  update public.regulatory_classification_policies
     set status = 'ACTIVE', approved_by_user_id = 'system:migration_review_20261121180000', approved_at = now()
   where id = v_id;
end $$;

-- Triage outcome recorded on every finding decision (new columns; existing rows untouched).
alter table public.ai_analysis_finding_decisions
  add column if not exists regulatory_classification_code text
    check (regulatory_classification_code is null
           or public.ri_classification_code_legal_status(regulatory_classification_code) is not null),
  add column if not exists legal_status text,
  add column if not exists classification_policy_id uuid
    references public.regulatory_classification_policies (id) on delete restrict,
  add column if not exists triage_queue text
    check (triage_queue is null or triage_queue in ('OBLIGATION_TRIAGE', 'NON_OBLIGATION_TRIAGE', 'EXCEPTION_TRIAGE')),
  add column if not exists exception_reasons text[] not null default '{}',
  add column if not exists disposition text
    check (disposition is null or disposition in (
      'CONVERT_TO_DRAFT_OBLIGATION', 'LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION',
      'HORIZON_SCANNING', 'ARCHIVE', 'RECLASSIFICATION_REQUESTED'
    )),
  add column if not exists linked_obligation_id uuid references public.regulatory_obligations (id) on delete restrict,
  add column if not exists reclassification_evidence text;

alter table public.ai_analysis_finding_decisions
  add constraint ai_analysis_finding_decisions_triaged check (triage_queue is not null) not valid;
alter table public.ai_analysis_finding_decisions
  add constraint ai_analysis_finding_decisions_conversion_eligible check (
    obligation_id is null
    or (
      triage_queue = 'OBLIGATION_TRIAGE'
      and disposition = 'CONVERT_TO_DRAFT_OBLIGATION'
      and legal_status in ('binding', 'evidential')
      and classification_policy_id is not null
      and cardinality(exception_reasons) = 0
    )
  ) not valid;

-- Obligation register guard: classification-driven conversion eligibility for every insert path.
create or replace function public.ri_authoritative_source_url_ok(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p_url) ~* '^https://(www\.)?(legislation\.gov\.uk|handbook\.fca\.org\.uk|eur-lex\.europa\.eu)/', false)
$$;

create or replace function public.ri_guard_obligation_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys constant text[] := array[
    'regulatoryClassificationCode', 'legalStatus', 'classificationPolicyId', 'classificationPolicyVersion',
    'regulatorKey', 'supportsObligationId', 'findingId', 'authoritativeProvision', 'legalBasis',
    'sourcePublicationType'
  ];
  v_actor text := public.current_clerk_user_id();
  v_manual boolean;
  v_provision jsonb;
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_code text := nullif(btrim(coalesce(v_meta ->> 'regulatoryClassificationCode', '')), '');
  v_publication uuid;
  v_regulator text;
  v_type text;
  v_policy public.regulatory_classification_policies%rowtype;
  v_entry public.regulatory_classification_policy_entries%rowtype;
  v_link text;
begin
  if tg_op = 'UPDATE' then
    if (select coalesce(jsonb_object_agg(k, old.metadata -> k), '{}'::jsonb) from unnest(v_keys) k where coalesce(old.metadata, '{}'::jsonb) ? k)
       is distinct from
       (select coalesce(jsonb_object_agg(k, new.metadata -> k), '{}'::jsonb) from unnest(v_keys) k where v_meta ? k) then
      raise exception 'obligation_classification_immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  v_manual := new.origin is distinct from 'AI_ASSISTED';
  if v_meta ? 'findingId' and v_manual then
    raise exception 'finding_conversion_requires_review' using errcode = '42501';
  end if;
  if v_code is null then
    raise exception 'obligation_classification_required' using errcode = '42501';
  end if;

  v_publication := coalesce(
    new.publication_id,
    (select ch.publication_id from public.regulatory_changes ch where ch.id = new.regulatory_change_id)
  );
  select r.external_key, lower(btrim(p.publication_type)) into v_regulator, v_type
    from public.regulatory_publications p
    join public.regulators r on r.id = p.regulator_id
   where p.id = v_publication;
  select * into v_policy
    from public.regulatory_classification_policies p
   where p.regulator_key = v_regulator and p.status = 'ACTIVE';
  if v_policy.id is null then
    raise exception 'classification_policy_unavailable' using errcode = '42501';
  end if;
  select * into v_entry
    from public.regulatory_classification_policy_entries e
   where e.policy_id = v_policy.id and e.code = v_code;
  if v_entry.id is null then
    raise exception 'obligation_classification_unknown' using errcode = '42501';
  end if;
  if not v_entry.conversion_enabled then
    raise exception 'obligation_conversion_not_permitted:%', v_code using errcode = '42501';
  end if;

  if v_manual then
    if new.status::text <> 'DRAFT' then
      raise exception 'classified_obligation_must_start_draft' using errcode = '23514';
    end if;
    if v_actor <> '' then
      if new.created_by_user_id is not null and new.created_by_user_id::text <> v_actor then
        raise exception 'obligation_creator_mismatch' using errcode = '42501';
      end if;
      new.created_by_user_id := v_actor;
    elsif new.created_by_user_id is null then
      raise exception 'obligation_creator_required' using errcode = '42501';
    end if;
    if length(btrim(coalesce(v_meta ->> 'legalBasis', ''))) < 3 then
      raise exception 'obligation_legal_basis_required' using errcode = '42501';
    end if;
    v_provision := v_meta -> 'authoritativeProvision';
    if jsonb_typeof(v_provision) is distinct from 'object'
       or length(btrim(coalesce(v_provision ->> 'reference', ''))) < 3
       or length(btrim(coalesce(v_provision ->> 'quotation', ''))) < 20 then
      raise exception 'obligation_authoritative_provision_required' using errcode = '42501';
    end if;
    if not public.ri_authoritative_source_url_ok(v_provision ->> 'sourceUrl') then
      raise exception 'obligation_authoritative_source_invalid' using errcode = '42501';
    end if;
  end if;

  -- Guidance text cannot ground a binding classification: an AI finding from a non-binding publication is
  -- refused; a manual obligation may sit on that publication's change only because it was verified against
  -- the authoritative provision itself and still needs independent approval.
  if not v_manual and v_type = any (v_policy.non_binding_publication_types) then
    raise exception 'obligation_source_not_binding' using errcode = '42501';
  end if;
  if v_entry.supporting_obligation_link_required then
    v_link := v_meta ->> 'supportsObligationId';
    if v_link is null
       or v_link !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.regulatory_obligations o
          where o.id = v_link::uuid
            and o.organisation_id = new.organisation_id
            and o.metadata ->> 'legalStatus' = 'binding'
       ) then
      raise exception 'obligation_binding_link_required' using errcode = '42501';
    end if;
  elsif v_meta ? 'supportsObligationId' then
    raise exception 'obligation_binding_link_not_applicable' using errcode = '42501';
  end if;

  new.metadata := v_meta || jsonb_build_object(
    'regulatoryClassificationCode', v_code,
    'legalStatus', v_entry.legal_status,
    'classificationPolicyId', v_policy.id,
    'classificationPolicyVersion', v_policy.policy_version,
    'regulatorKey', v_regulator,
    'sourcePublicationType', v_type
  );
  if v_manual then
    new.metadata := new.metadata || jsonb_build_object(
      'authoritativeProvision', v_provision || jsonb_build_object(
        'verifiedBy', new.created_by_user_id, 'verifiedAt', to_jsonb(now())
      )
    );
  end if;
  return new;
end;
$$;

create trigger ri_guard_obligation_classification
  before insert or update of metadata on public.regulatory_obligations
  for each row execute function public.ri_guard_obligation_classification();

-- Classified manual obligations follow the AI obligation approval workflow: DRAFT → IN_REVIEW (submitter
-- recorded in ai_submitted_by_user_id) → OPEN only by an active non-viewer member who is neither the creator
-- nor the submitter. Unclassified legacy manual obligations keep their existing lifecycle.
create or replace function public.ri_guard_classified_obligation_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
begin
  if old.origin::text = 'AI_ASSISTED' or not (coalesce(old.metadata, '{}'::jsonb) ? 'classificationPolicyId') then
    return new;
  end if;
  if new.origin is distinct from old.origin or new.created_by_user_id is distinct from old.created_by_user_id
     or new.organisation_id is distinct from old.organisation_id then
    raise exception 'classified_obligation_provenance_immutable' using errcode = '42501';
  end if;
  new.ai_submitted_by_user_id := old.ai_submitted_by_user_id;
  if new.status = old.status then
    return new;
  end if;

  if old.status::text = 'DRAFT' then
    if new.status::text <> 'IN_REVIEW' then
      raise exception 'classified_obligation_invalid_transition' using errcode = '23514';
    end if;
    if v_actor = '' then
      raise exception 'classified_obligation_submission_requires_user' using errcode = '42501';
    end if;
    new.ai_submitted_by_user_id := v_actor;
    return new;
  end if;

  if old.status::text = 'IN_REVIEW' then
    if new.status::text not in ('DRAFT', 'OPEN') then
      raise exception 'classified_obligation_invalid_transition' using errcode = '23514';
    end if;
    if new.status::text = 'OPEN' then
      if v_actor = '' then
        raise exception 'classified_obligation_approval_requires_user' using errcode = '42501';
      end if;
      if old.ai_submitted_by_user_id is null then
        raise exception 'classified_obligation_submitter_unknown' using errcode = '23514';
      end if;
      if v_actor = any (array[old.created_by_user_id::text, old.ai_submitted_by_user_id]) then
        raise exception 'segregation_of_duties' using errcode = '42501';
      end if;
      if not exists (
        select 1
          from public.organisation_memberships m
         where m.organisation_id = new.organisation_id
           and m.clerk_user_id = v_actor
           and m.status::text = 'active'
           and m.role::text <> 'VIEWER'
      ) then
        raise exception 'classified_obligation_review_role_required' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger ri_guard_classified_obligation_status
  before update on public.regulatory_obligations
  for each row execute function public.ri_guard_classified_obligation_status();

-- Below ANALYST, the only obligation change remains the approve / return decision; it now also covers
-- classified manual obligations (from 20261120140000, AI_ASSISTED only).
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
    if (old.origin::text = 'AI_ASSISTED' or coalesce(old.metadata, '{}'::jsonb) ? 'classificationPolicyId')
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

-- Reporting: independently binding obligations vs evidential compliance requirements.
create or replace view public.ri_obligation_legal_classification
with (security_invoker = true) as
select o.id as obligation_id,
       o.organisation_id,
       o.status,
       o.origin,
       o.metadata ->> 'regulatoryClassificationCode' as classification_code,
       o.metadata ->> 'legalStatus' as legal_status,
       case o.metadata ->> 'legalStatus'
         when 'binding' then 'BINDING_OBLIGATION'
         when 'evidential' then 'EVIDENTIAL_REQUIREMENT'
         else 'UNCLASSIFIED'
       end as reporting_category,
       nullif(o.metadata ->> 'supportsObligationId', '')::uuid as supports_obligation_id,
       (o.metadata ->> 'classificationPolicyVersion')::integer as classification_policy_version,
       o.metadata ->> 'regulatorKey' as regulator_key,
       coalesce(o.metadata ->> 'legalStatus', '') not in ('binding', 'evidential') as classification_review_required
  from public.regulatory_obligations o;

grant select on public.ri_obligation_legal_classification to authenticated;
revoke all on public.ri_obligation_legal_classification from anon;

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
