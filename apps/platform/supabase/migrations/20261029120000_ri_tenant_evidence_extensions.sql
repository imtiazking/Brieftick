-- FORGENIQ Phase 83E — tenant evidence versions and change links (additive).
-- Storage bucket ri-tenant-evidence is configured separately (see docs/STAGING-PHASE8-STEP-83E-TENANT-EVIDENCE-STORAGE.md).

create table public.evidence_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  content_type text not null,
  byte_size bigint not null,
  source_hash text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  constraint evidence_versions_unique_version unique (evidence_id, version_number),
  constraint evidence_versions_byte_size_positive check (byte_size > 0)
);

create index evidence_versions_organisation_id_idx on public.evidence_versions (organisation_id);
create index evidence_versions_evidence_id_idx on public.evidence_versions (evidence_id);

create table public.evidence_regulatory_change_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  regulatory_change_id uuid not null references public.regulatory_changes (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evidence_regulatory_change_links_unique unique (evidence_id, regulatory_change_id)
);

create index evidence_regulatory_change_links_org_idx
  on public.evidence_regulatory_change_links (organisation_id);

alter table public.applicability_assessments
  add column if not exists submitted_by text,
  add column if not exists submitted_at timestamptz;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'evidence_versions',
    'evidence_regulatory_change_links'
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

create or replace function public.enforce_evidence_change_link_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  ev_org uuid;
  ch_org uuid;
begin
  select organisation_id into ev_org from public.evidence_items where id = new.evidence_id;
  select organisation_id into ch_org from public.regulatory_changes where id = new.regulatory_change_id;
  if ev_org is distinct from new.organisation_id
     or ch_org is distinct from new.organisation_id
     or ev_org is distinct from ch_org then
    raise exception 'cross_tenant_evidence_link_rejected';
  end if;
  return new;
end;
$$;

create trigger evidence_regulatory_change_links_tenant_consistency
before insert or update on public.evidence_regulatory_change_links
for each row execute function public.enforce_evidence_change_link_tenant_consistency();
