#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const admin = createClient(url, key, { auth: { persistSession: false } });

const EXCLUDE = new Set([
  '56b0beca-d8c3-4267-a794-9079009af661',
  'a761cacc-8742-493d-b200-eb5d9a3ab884',
  '4d05b49b-a4a4-4101-8c87-7d3983315f25',
]);

const { data: pubs, error } = await admin
  .from('regulatory_publications')
  .select('id,title,publication_type,external_document_id,canonical_url')
  .ilike('canonical_url', '%fca.org.uk%')
  .order('title')
  .limit(80);

if (error) {
  console.log(JSON.stringify({ ok: false, error: error.message }));
  process.exit(0);
}

const filtered = (pubs || []).filter((p) => !EXCLUDE.has(p.id));
const ids = filtered.map((p) => p.id);
const { data: revs, error: revErr } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('publication_id,extraction_profile,extraction_quality,id')
  .in('publication_id', ids.length ? ids.slice(0, 60) : ['00000000-0000-4000-8000-000000000001']);

const revByPub = new Map();
for (const r of revs || []) {
  const prev = revByPub.get(r.publication_id) || [];
  prev.push(r);
  revByPub.set(r.publication_id, prev);
}

const withEvidence = filtered
  .map((p) => ({
  ...p,
  revisions: revByPub.get(p.id) || [],
}))
  .filter((p) => p.revisions.length > 0);

const { data: allRevs } = await admin
  .from('regulatory_source_extraction_revisions')
  .select('publication_id,extraction_profile,id')
  .limit(200);

const pubIdsWithRev = new Set((allRevs || []).map((r) => r.publication_id));
const { data: revPubs } = await admin
  .from('regulatory_publications')
  .select('id,title,publication_type,external_document_id,canonical_url')
  .in('id', [...pubIdsWithRev].filter((id) => !EXCLUDE.has(id)).slice(0, 40));

const keywords = ['consumer duty', 'financial crime', 'crypto', 'policy statement', 'consultation', 'guidance', 'operational resilience', 'fair value'];
const keywordHits = [];
for (const kw of keywords) {
  const { data: rows } = await admin
    .from('regulatory_publications')
    .select('id,title,canonical_url')
    .ilike('title', `%${kw}%`)
    .limit(8);
  keywordHits.push({ kw, count: rows?.length ?? 0, sample: rows?.slice(0, 3) });
}

console.log(
  JSON.stringify({
    ok: true,
    fcaCount: filtered.length,
    withRevisions: withEvidence.length,
    revError: revErr?.message,
    distinctPubsWithAnyRevision: pubIdsWithRev.size,
    supplementalCandidates: (revPubs || []).slice(0, 25),
    keywordHits,
    sample: withEvidence.slice(0, 25),
  }),
);
