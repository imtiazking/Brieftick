-- Phase 83F.1 — private tenant evidence bucket + storage.objects RLS (Supabase Storage only).
-- Skipped automatically when storage schema is absent (embedded Postgres acceptance harness).

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping ri-tenant-evidence bucket policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'ri-tenant-evidence',
    'ri-tenant-evidence',
    false,
    5242880,
    array['application/pdf', 'text/plain', 'image/png', 'image/jpeg']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
end $$;

create or replace function public.storage_tenant_evidence_org_id(object_name text)
returns uuid
language sql
stable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  execute 'drop policy if exists ri_tenant_evidence_select_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_insert_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_update_member on storage.objects';
  execute 'drop policy if exists ri_tenant_evidence_delete_member on storage.objects';

  execute $p$
    create policy ri_tenant_evidence_select_member
    on storage.objects for select to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;

  execute $p$
    create policy ri_tenant_evidence_insert_member
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;

  execute $p$
    create policy ri_tenant_evidence_update_member
    on storage.objects for update to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
    with check (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;

  execute $p$
    create policy ri_tenant_evidence_delete_member
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'ri-tenant-evidence'
      and public.is_active_member(public.storage_tenant_evidence_org_id(name))
    )
  $p$;
end $$;

-- service_role bypasses storage RLS in Supabase; tenant evidence routes MUST use user JWT client (lib/evidence-storage.ts).
