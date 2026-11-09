#!/usr/bin/env node
/**
 * Read-only: Fair value snapshot / extraction state (staging Supabase).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PUB_ID = '56b0beca-d8c3-4267-a794-9079009af661';
const SNAPSHOT_V4 = '122a70c0-c436-40a8-9c10-3eb61c4d24d1';

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, '../../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: snaps, error: snapErr } = await admin
  .from('regulatory_source_snapshots')
  .select(
    'id, publication_id, publication_version_id, canonical_url, content_type, raw_content_sha256, raw_storage_path, normalised_html_storage_path, created_at',
  )
  .eq('publication_id', PUB_ID)
  .order('created_at', { ascending: false });

const { data: fg } = await admin
  .from('regulatory_publications')
  .select('id, title, canonical_url, external_document_id, publication_type')
  .or(
    'title.ilike.%FG22%,external_document_id.ilike.%FG22%,canonical_url.ilike.%fg22%,title.ilike.%Finalised guidance%Consumer%,canonical_url.ilike.%fg22-5%',
  )
  .limit(12);

const { data: pdfRevisions } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('id, publication_id, extraction_profile, source_snapshot_id, created_at')
  .eq('extraction_profile', 'pdf_primary_v1')
  .limit(20);

let pdfPubDetails = [];
for (const row of pdfRevisions || []) {
  const { data: pub } = await admin
    .from('regulatory_publications')
    .select('id, title, canonical_url, external_document_id')
    .eq('id', row.publication_id)
    .maybeSingle();
  pdfPubDetails.push({ revision: row, publication: pub });
}

let fgRevs = [];
for (const row of fg || []) {
  const { data } = await admin
    .from('regulatory_source_extraction_revisions')
    .select('id, extraction_profile, source_snapshot_id, publication_id, created_at')
    .eq('publication_id', row.id)
    .limit(5);
  fgRevs.push({ publication: row, revisions: data || [] });
}

const v4 = (snaps || []).find((s) => s.id === SNAPSHOT_V4) || snaps?.[0];

console.log(
  JSON.stringify(
    {
      snapErr: snapErr?.message,
      snapshotCount: snaps?.length ?? 0,
      snapshots: snaps,
      latestV4: v4,
      fg22Catalogue: fgRevs,
      pdfPrimaryV1Revisions: pdfPubDetails,
    },
    null,
    2,
  ),
);
