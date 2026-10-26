#!/usr/bin/env node
/**
 * Phase 8C.1d — snapshot storage runtime (config validation, no live Supabase uploads).
 */
import {
  validateSupabaseSnapshotConfig,
  extractProjectRefFromSupabaseUrl,
} from '../lib/ri/ingestion/snapshot/supabase-config.mjs';
import {
  ensureSnapshotStorageReady,
  getSnapshotStorage,
  resetSnapshotStorage,
  setSnapshotStorage,
} from '../lib/ri/ingestion/snapshot/resolve-storage.mjs';
import { createMemorySnapshotStorage } from '../lib/ri/ingestion/snapshot/memory-storage.mjs';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '../lib/ri/ingestion/snapshot/staging-constants.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

function withEnv(patch, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(patch)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetSnapshotStorage();
  }
}

async function withEnvAsync(patch, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(patch)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetSnapshotStorage();
  }
}

const stagingUrl = `https://${FORGENIQ_RI_STAGING_PROJECT_REF}.supabase.co`;

// --- URL parsing ---
if (extractProjectRefFromSupabaseUrl(stagingUrl) === FORGENIQ_RI_STAGING_PROJECT_REF) {
  pass('extract project ref from staging URL');
} else failMsg('extract project ref');

// --- Correct staging config (validation only) ---
withEnv(
  {
    FORGENIQ_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-real',
    SUPABASE_PROJECT_REF: FORGENIQ_RI_STAGING_PROJECT_REF,
    RI_SNAPSHOT_STORAGE_MODE: undefined,
  },
  () => {
    try {
      const c = validateSupabaseSnapshotConfig({ environment: 'staging', requireApprovedStagingProject: true });
      if (c.projectRef === FORGENIQ_RI_STAGING_PROJECT_REF && c.bucket === 'regulatory-source-snapshots') {
        pass('valid staging config accepted');
      } else failMsg('staging config fields');
    } catch (e) {
      failMsg(`valid staging config: ${e.message}`);
    }
  },
);

// --- Wrong project ---
withEnv(
  {
    FORGENIQ_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://wrongprojectref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  },
  () => {
    try {
      validateSupabaseSnapshotConfig({ environment: 'staging', requireApprovedStagingProject: true });
      failMsg('wrong project should throw');
    } catch (e) {
      if (e.message.includes('snapshot_storage_project_mismatch')) pass('wrong project ref rejected');
      else failMsg(`wrong project error: ${e.message}`);
    }
  },
);

// --- Missing credentials ---
withEnv(
  {
    FORGENIQ_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
  () => {
    try {
      validateSupabaseSnapshotConfig({ environment: 'staging' });
      failMsg('missing service key should throw');
    } catch (e) {
      if (e.message.includes('SUPABASE_SERVICE_ROLE_KEY')) pass('missing service role rejected');
      else failMsg(`missing key: ${e.message}`);
    }
  },
);

// --- Staging without init: no memory fallback ---
withEnv({ FORGENIQ_ENV: 'staging' }, () => {
  try {
    getSnapshotStorage({ environment: 'staging' });
    failMsg('staging getSnapshotStorage should not return memory');
  } catch (e) {
    if (e.message.includes('snapshot_storage_not_initialized')) pass('no in-memory fallback in staging');
    else failMsg(`staging getSnapshotStorage: ${e.message}`);
  }
});

// --- Local default: memory when not staging ---
withEnv({ FORGENIQ_ENV: 'local', RI_SNAPSHOT_STORAGE_MODE: undefined }, () => {
  const s = getSnapshotStorage({ environment: 'local' });
  if (s.kind === 'memory') pass('local uses memory storage by default');
  else failMsg('local memory default');
});

// --- Test override wins over staging ---
await withEnvAsync(
  {
    FORGENIQ_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  },
  async () => {
    setSnapshotStorage(createMemorySnapshotStorage());
    await ensureSnapshotStorageReady({ environment: 'staging' });
    const s = getSnapshotStorage({ environment: 'staging' });
    if (s.kind === 'memory') pass('explicit test override skips remote init');
    else failMsg('test override');
  },
);

// --- Missing bucket (mock listBuckets) ---
await withEnvAsync(
  {
    FORGENIQ_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    SUPABASE_PROJECT_REF: FORGENIQ_RI_STAGING_PROJECT_REF,
  },
  async () => {
    const mockModule = {
      createClient: () => ({
        storage: {
          listBuckets: async () => ({ data: [], error: null }),
        },
        auth: { persistSession: false },
      }),
    };
    // ensureSnapshotStorageReady uses createClient from package — bucket check only via integration;
    // validate bucket missing path via assertSnapshotBucketReady import
    const { assertSnapshotBucketReady } = await import('../lib/ri/ingestion/snapshot/supabase-config.mjs');
    const fake = mockModule.createClient();
    try {
      await assertSnapshotBucketReady(fake, 'regulatory-source-snapshots');
      failMsg('missing bucket should throw');
    } catch (e) {
      if (e.message.includes('snapshot_storage_bucket_missing')) pass('missing bucket rejected');
      else failMsg(`missing bucket: ${e.message}`);
    }
  },
);

if (fail) {
  console.error(`\nacceptance-phase-8c1-snapshot-runtime: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nacceptance-phase-8c1-snapshot-runtime: PASS\n');
