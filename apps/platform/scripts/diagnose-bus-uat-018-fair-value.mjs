#!/usr/bin/env node
/**
 * Read-only staging/prod probe for BUS-UAT-018 (no mutations).
 * Loads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local when present.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { resolveCataloguePublicationIdsForQuestion } from '../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { loadPublicationHtmlEvidenceForAskRi } from '../lib/ri/ask-ri/load-publication-html-evidence.mjs';

const PUB_ID = '56b0beca-d8c3-4267-a794-9079009af661';
const HTML_ONLY =
  "Using only the FCA webpage 'Fair value in consumer finance', explain what it says about Consumer Duty fair-value assessments. Provide citations to the original webpage and its relevant sections. Do not use PDF sources or invent regulatory deadlines.";

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, '../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!projectUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local)');
  process.exit(2);
}

const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false } });

const resolved = await resolveCataloguePublicationIdsForQuestion(admin, HTML_ONLY);
console.log('resolveCataloguePublicationIdsForQuestion', resolved);

const { count: versionCount } = await admin
  .from('regulatory_publication_versions')
  .select('id', { count: 'exact', head: true })
  .eq('publication_id', PUB_ID);

const { data: byPub, error: byPubErr } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('id, publication_id, publication_version_id, extraction_profile, created_at', { count: 'exact' })
  .eq('publication_id', PUB_ID)
  .eq('extraction_profile', 'html_article_v2')
  .limit(5);

const { data: versions } = await admin
  .from('regulatory_publication_versions')
  .select('id, version_number, created_at')
  .eq('publication_id', PUB_ID)
  .order('version_number', { ascending: false })
  .limit(8);

const { data: snapshots } = await admin
  .from('regulatory_source_snapshots')
  .select('id, publication_id, publication_version_id, created_at')
  .eq('publication_id', PUB_ID)
  .order('created_at', { ascending: false })
  .limit(8);

const versionIds = (versions || []).map((v) => v.id);
let byVer = [];
if (versionIds.length) {
  const r = await admin
    .from('regulatory_source_extraction_revisions')
    .select('id, publication_id, publication_version_id, extraction_profile, created_at')
    .in('publication_version_id', versionIds)
    .eq('extraction_profile', 'html_article_v2')
    .limit(8);
  byVer = r.data || [];
}

const { data: pubRow } = await admin
  .from('regulatory_publications')
  .select('id, title, canonical_url, publication_type, external_document_id')
  .eq('id', PUB_ID)
  .maybeSingle();

const { data: allRevs } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('id, extraction_profile, publication_id, publication_version_id, created_at')
  .eq('publication_id', PUB_ID)
  .order('created_at', { ascending: false })
  .limit(20);

const snapshotIds = (snapshots || []).map((s) => s.id);
let revsBySnapshot = [];
if (snapshotIds.length) {
  const r = await admin
    .from('regulatory_source_extraction_revisions')
    .select('id, extraction_profile, source_snapshot_id, publication_id, publication_version_id')
    .in('source_snapshot_id', snapshotIds)
    .limit(20);
  revsBySnapshot = r.data || [];
  if (!revsBySnapshot.length) {
    const any = await admin
      .from('regulatory_source_extraction_revisions')
      .select('id, extraction_profile, source_snapshot_id')
      .order('created_at', { ascending: false })
      .limit(3);
    console.log('globalRecentRevisionsSample', any.data);
  }
}

const loaded = await loadPublicationHtmlEvidenceForAskRi(admin, {
  projectUrl,
  serviceRoleKey,
  publicationIds: [PUB_ID],
});

console.log(
  JSON.stringify(
    {
      publication: pubRow,
      publicationId: PUB_ID,
      versionCount,
      allRevisionsOnPublicationId: allRevs?.length ?? 0,
      allRevisionProfiles: [...new Set((allRevs || []).map((r) => r.extraction_profile))],
      htmlRevisionsByPublicationId: { error: byPubErr?.message ?? null, rows: byPub?.length ?? 0, sample: byPub },
      htmlRevisionsByVersionId: { versionIds: versionIds.length, rows: byVer.length, sample: byVer },
      publicationVersions: versions,
      sourceSnapshots: snapshots,
      revisionsBySnapshotIds: revsBySnapshot,
      load: {
        lookup: loaded.lookup,
        revisionRowsFound: loaded.revisionRowsFound,
        evidenceCount: loaded.evidence?.length ?? 0,
        blockCount: loaded.evidence?.[0]?.evidenceBlocks?.length ?? 0,
        errorCodes: (loaded.errors || []).map((e) => e.code),
      },
    },
    null,
    2,
  ),
);
