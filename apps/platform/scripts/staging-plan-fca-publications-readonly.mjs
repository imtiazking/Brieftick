#!/usr/bin/env node
/** Read-only: list FCA catalogue candidates for ingestion planning. */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: 'missing_credentials' }));
  process.exit(0);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const domains = [
  '%consumer duty%',
  '%fair value%',
  '%financial crime%',
  '%money laundering%',
  '%sanction%',
  '%fraud%',
  '%operational resilience%',
  '%outsourc%',
  '%third party%',
  '%consultation%',
  '%policy statement%',
  '%finalised guidance%',
  '%discussion paper%',
];

const byId = new Map();
for (const pattern of domains) {
  const { data } = await admin
    .from('regulatory_publications')
    .select('id,title,publication_type,external_document_id,canonical_url,source_version')
    .ilike('canonical_url', '%fca.org.uk%')
    .ilike('title', pattern)
    .limit(25);
  for (const row of data || []) byId.set(row.id, row);
}

const { data: fcaAll } = await admin
  .from('regulatory_publications')
  .select('id,title,publication_type,external_document_id,canonical_url')
  .ilike('canonical_url', '%fca.org.uk%')
  .limit(80);

for (const row of fcaAll || []) byId.set(row.id, row);

const ids = [...byId.keys()];
const { data: revs } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('publication_id,extraction_profile,id,created_at')
  .in('publication_id', ids.length ? ids : ['00000000-0000-4000-8000-000000000000']);

const revMap = new Map();
for (const r of revs || []) {
  const list = revMap.get(r.publication_id) || [];
  list.push(r);
  revMap.set(r.publication_id, list);
}

const rows = [...byId.values()].map((p) => ({
  publicationId: p.id,
  title: String(p.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
  canonicalUrl: p.canonical_url,
  publicationType: p.publication_type,
  externalDocumentId: p.external_document_id,
  extractionRevisions: revMap.get(p.id) || [],
  hasHtmlV2: (revMap.get(p.id) || []).some((r) => r.extraction_profile === 'html_article_v2'),
  hasPdfPrimary: (revMap.get(p.id) || []).some((r) => r.extraction_profile === 'pdf_primary_v1'),
}));

const out = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-d-staging-fca-catalogue-snapshot.json');
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
console.log(JSON.stringify({ ok: true, count: rows.length, withRevisions: rows.filter((r) => r.extractionRevisions.length).length }));
