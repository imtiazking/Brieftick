/**
 * Prioritized publications missing snapshots (Tranche G corpus population).
 * @param {import('pg').Client} client
 * @param {number} limit
 */
export async function selectCorpusBackfillCandidates(client, limit = 3) {
  const { rows } = await client.query(
    `with obligation_pubs as (
       select distinct o.publication_id from regulatory_obligations o
       where o.publication_id is not null
     ),
     change_pubs as (
       select distinct rc.publication_id from regulatory_changes rc
       where rc.publication_id is not null
     ),
     missing as (
       select
         p.id,
         p.title,
         p.publication_type,
         p.canonical_url,
       p.source_hash,
       p.source_id,
       (p.provenance->'corpusBackfill'->>'queuedAt') as corpus_queued_at,
       reg.external_key as regulator_key,
         src.external_key as source_key,
         case when p.canonical_url ~* '\\.pdf(\\?|#|$)' then true else false end as canonical_is_pdf
       from regulatory_publications p
       join regulators reg on reg.id = p.regulator_id
       join regulatory_sources src on src.id = p.source_id
       where p.canonical_url is not null
         and length(trim(p.canonical_url)) > 12
         and not exists (select 1 from regulatory_source_snapshots s where s.publication_id = p.id)
         and coalesce(p.provenance->'corpusBackfill'->>'terminal', 'false') <> 'true'
         and reg.external_key not in ('REG-OFAC')
         and src.external_key not like '%OFAC%'
         and case when p.canonical_url ~* '\\.pdf(\\?|#|$)' then true else false end = false
     )
     select m.*
     from missing m
     left join obligation_pubs op on op.publication_id = m.id
     left join change_pubs cp on cp.publication_id = m.id
     order by
       case when m.corpus_queued_at is not null then 0 else 1 end,
       case when op.publication_id is not null then 0 else 1 end,
       case when cp.publication_id is not null then 0 else 1 end,
       case m.regulator_key when 'REG-FCA' then 0 when 'REG-PRA' then 1 else 2 end,
       case m.publication_type
         when 'policy_statement' then 0
         when 'final_rules' then 1
         when 'regulatory_change' then 2
         when 'consultation_paper' then 3
         when 'guidance' then 4
         when 'supervisory_statement' then 5
         else 6
       end,
       m.title
     limit $1`,
    [limit],
  );
  return rows;
}

/**
 * PDF-canonical publications missing snapshots.
 */
export async function selectCorpusPdfCanonicalCandidates(client, limit = 1) {
  const { rows } = await client.query(
    `select p.id, p.title, p.publication_type, p.canonical_url, p.source_hash, p.source_id,
            reg.external_key as regulator_key, src.external_key as source_key, true as canonical_is_pdf
     from regulatory_publications p
     join regulators reg on reg.id = p.regulator_id
     join regulatory_sources src on src.id = p.source_id
     where p.canonical_url ~* '\\.pdf(\\?|#|$)'
       and not exists (select 1 from regulatory_source_snapshots s where s.publication_id = p.id)
       and coalesce(p.provenance->'corpusBackfill'->>'terminal', 'false') <> 'true'
       and reg.external_key not in ('REG-OFAC')
     order by case reg.external_key when 'REG-FCA' then 0 when 'REG-PRA' then 1 else 2 end, p.title
     limit $1`,
    [limit],
  );
  return rows;
}

/**
 * HTML snapshots awaiting pdf_primary_v1 where attachments may exist.
 */
export async function selectSnapshotsNeedingPdfPrimary(client, limit = 2) {
  const { rows } = await client.query(
    `select s.id as snapshot_id, s.publication_id, p.title, src.external_key as source_key
     from regulatory_source_snapshots s
     join regulatory_publications p on p.id = s.publication_id
     join regulatory_sources src on src.id = p.source_id
     where exists (
       select 1 from regulatory_source_extraction_revisions h
       where h.source_snapshot_id = s.id and h.extraction_profile = 'html_article_v2'
     )
       and not exists (
       select 1 from regulatory_source_extraction_revisions r
       where r.source_snapshot_id = s.id and r.extraction_profile = 'pdf_primary_v1'
     )
       and coalesce(p.provenance->'corpusBackfill'->>'terminal', 'false') <> 'true'
     order by
       (select case when jsonb_array_length(coalesce(h.pdf_attachments, '[]'::jsonb)) > 0 then 0 else 1 end
        from regulatory_source_extraction_revisions h
        where h.source_snapshot_id = s.id and h.extraction_profile = 'html_article_v2'
        limit 1),
       s.retrieved_at asc nulls first
     limit $1`,
    [limit],
  );
  return rows;
}

/**
 * Snapshots that never received html_article_v2 (re-derive queue).
 */
export async function selectSnapshotsNeedingHtmlExtraction(client, limit = 5) {
  const { rows } = await client.query(
    `select s.id as snapshot_id, s.publication_id, s.raw_storage_path, s.canonical_url
     from regulatory_source_snapshots s
     join regulatory_publications p on p.id = s.publication_id
     where not exists (
       select 1 from regulatory_source_extraction_revisions r
       where r.source_snapshot_id = s.id and r.extraction_profile = 'html_article_v2'
     )
       and coalesce(p.provenance->'corpusBackfill'->>'terminal', 'false') <> 'true'
     order by s.retrieved_at asc nulls first
     limit $1`,
    [limit],
  );
  return rows;
}