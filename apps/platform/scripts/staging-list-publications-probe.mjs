#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: 'missing_supabase_credentials' }));
  process.exit(0);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin
  .from('regulatory_publications')
  .select('id,title,publication_type,external_document_id,canonical_url')
  .order('title')
  .limit(40);

console.log(
  JSON.stringify({
    ok: !error,
    count: data?.length ?? 0,
    error: error?.message,
    sample: data?.slice(0, 15),
  }),
);
