#!/usr/bin/env node
/**
 * Step 83F.1 D-01 — runtime half of the evidence-upload transaction-safety acceptance (mocked Supabase client, no network).
 *
 * Proves the compensating behaviour of uploadTenantEvidenceVersion:
 *  - object storage is written before the version row, and the version row before the item pointer;
 *  - a failed version insert removes the stored object; a failed item update removes the version row AND the object;
 *  - a failed cleanup is logged (EVIDENCE_UPLOAD_CLEANUP_FAILED) and never masks the original error;
 *  - an audit-event failure does not fail an otherwise successful upload;
 *  - duplicate content, wrong organisation, bad content type and bad size are refused BEFORE anything is written.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { uploadTenantEvidenceVersion, tenantEvidenceObjectPath } = await import('../lib/ri/evidence-storage.ts');

let pass = 0;
let fail = 0;
const check = (id, ok, detail) => {
  if (ok) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL: ${id}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
};

const ORG = 'org-a';
const EV = 'ev-1';
const USER = 'user-1';
const PDF = { organisationId: ORG, evidenceId: EV, userId: USER, filename: 'policy.pdf', contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 evidence') };

/** Minimal PostgREST-shaped mock. `cfg` selects which operations fail. */
function mockSupabase(cfg = {}) {
  const calls = [];
  const rec = (c) => calls.push(c);
  const from = (table) => {
    const q = { table, op: null, filters: {}, single: false };
    const api = {
      select() { q.op ??= 'select'; return api; },
      insert(values) { q.op = 'insert'; q.values = values; return api; },
      update(values) { q.op = 'update'; q.values = values; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(col, val) { q.filters[col] = val; return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { q.single = true; return api; },
      single() { q.single = true; return api; },
      then(resolve, reject) {
        rec(`${q.op}:${q.table}`);
        let out;
        if (q.table === 'evidence_items' && q.op === 'select') {
          out = { data: cfg.itemMissing ? null : { id: EV }, error: null };
        } else if (q.table === 'evidence_versions' && q.op === 'select') {
          const rows = cfg.latestHash ? [{ version_number: 3, source_hash: cfg.latestHash }] : [];
          out = { data: q.single ? rows[0] ?? null : rows, error: null };
        } else if (q.table === 'evidence_versions' && q.op === 'insert') {
          out = cfg.versionInsertError ? { data: null, error: { message: 'insert_failed' } } : { data: { id: 'ver-1', ...q.values }, error: null };
        } else if (q.table === 'evidence_items' && q.op === 'update') {
          out = { error: cfg.itemUpdateError ? { message: 'item_update_failed' } : null };
        } else if (q.table === 'evidence_versions' && q.op === 'delete') {
          out = { error: null };
        } else if (q.table === 'workflow_events' && q.op === 'insert') {
          out = { error: cfg.auditError ? { message: 'audit_down' } : null };
        } else {
          out = { data: null, error: { message: `unexpected ${q.op}:${q.table}` } };
        }
        return Promise.resolve(out).then(resolve, reject);
      },
    };
    return api;
  };
  const storage = {
    from() {
      return {
        async upload(path) {
          rec(`upload:${path}`);
          return { error: cfg.uploadError ? { message: 'upload_failed' } : null };
        },
        async remove(paths) {
          rec(`remove:${paths[0]}`);
          return { error: cfg.removeError ? { message: 'remove_failed' } : null };
        },
      };
    },
  };
  return { client: { from, storage }, calls };
}

async function run(cfg, params = PDF) {
  const { client, calls } = mockSupabase(cfg);
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a);
  let result;
  let thrown = null;
  try {
    result = await uploadTenantEvidenceVersion(client, params);
  } catch (e) {
    thrown = e;
  } finally {
    console.error = origError;
  }
  return { result, thrown, calls, errors };
}
const wrote = (calls) => calls.some((c) => c.startsWith('upload:') || c.startsWith('insert:') || c.startsWith('update:'));
const expectedPath = tenantEvidenceObjectPath(ORG, EV, 1, 'policy.pdf');

// 1. happy path ordering
{
  const r = await run({});
  const iU = r.calls.findIndex((c) => c.startsWith('upload:'));
  const iV = r.calls.indexOf('insert:evidence_versions');
  const iI = r.calls.indexOf('update:evidence_items');
  const iA = r.calls.indexOf('insert:workflow_events');
  check('success: returns the version row', !r.thrown && r.result?.id === 'ver-1' && r.result?.storage_path === expectedPath, r.thrown?.message);
  check('success: storage -> version row -> item pointer -> audit', iU >= 0 && iU < iV && iV < iI && iI < iA, r.calls);
  check('success: nothing is cleaned up', !r.calls.some((c) => c.startsWith('remove:') || c === 'delete:evidence_versions'));
  check('success: object path is prefixed with the organisation', r.calls[iU] === `upload:${expectedPath}` && expectedPath.startsWith(`${ORG}/`), r.calls[iU]);
}

// 2. version insert fails -> stored object removed
{
  const r = await run({ versionInsertError: true });
  check('version insert failure: original error surfaced', r.thrown?.message === 'insert_failed', r.thrown?.message);
  check('version insert failure: stored object removed', r.calls.includes(`remove:${expectedPath}`), r.calls);
  check('version insert failure: item pointer never updated', !r.calls.includes('update:evidence_items'));
}

// 3. item update fails -> version row AND object removed
{
  const r = await run({ itemUpdateError: true });
  check('item update failure: original error surfaced', r.thrown?.message === 'item_update_failed', r.thrown?.message);
  check('item update failure: version row deleted and object removed', r.calls.includes('delete:evidence_versions') && r.calls.includes(`remove:${expectedPath}`), r.calls);
  check('item update failure: no success audit event', !r.calls.includes('insert:workflow_events'));
}

// 4. cleanup failure is logged and never masks the original error
{
  const r = await run({ versionInsertError: true, removeError: true });
  check('cleanup failure: original error still thrown', r.thrown?.message === 'insert_failed', r.thrown?.message);
  check('cleanup failure: EVIDENCE_UPLOAD_CLEANUP_FAILED logged', r.errors.some((e) => String(e[0]).includes('EVIDENCE_UPLOAD_CLEANUP_FAILED')), r.errors);
}

// 5. audit failure does not fail a successful upload, but is logged
{
  const r = await run({ auditError: true });
  check('audit failure: upload still succeeds', !r.thrown && r.result?.id === 'ver-1', r.thrown?.message);
  check('audit failure: EVIDENCE_UPLOAD_AUDIT_FAILED logged', r.errors.some((e) => String(e[0]).includes('EVIDENCE_UPLOAD_AUDIT_FAILED')), r.errors);
  check('audit failure: nothing rolled back', !r.calls.some((c) => c.startsWith('remove:') || c === 'delete:evidence_versions'));
}

// 6. storage upload failure -> nothing else written, nothing to clean
{
  const r = await run({ uploadError: true });
  check('upload failure: error surfaced', r.thrown?.message === 'upload_failed', r.thrown?.message);
  check('upload failure: no version row, no pointer, no cleanup', !r.calls.includes('insert:evidence_versions') && !r.calls.includes('update:evidence_items') && !r.calls.some((c) => c.startsWith('remove:')), r.calls);
}

// 7. refusals happen before any write
{
  const dup = await run({ latestHash: (await import('../lib/ri/evidence-storage.ts')).hashEvidenceBytes(PDF.bytes) });
  check('duplicate content: refused before any write', dup.thrown?.message === 'evidence_duplicate_content' && !wrote(dup.calls), dup.calls);

  const wrongOrg = await run({ itemMissing: true });
  check('evidence item outside the organisation: refused before any write', Boolean(wrongOrg.thrown) && !wrote(wrongOrg.calls), wrongOrg.thrown?.message);

  const badType = await run({}, { ...PDF, contentType: 'application/x-msdownload' });
  check('disallowed content type: refused before any write', badType.thrown?.message === 'evidence_invalid_content_type' && !wrote(badType.calls), badType.thrown?.message);

  const empty = await run({}, { ...PDF, bytes: Buffer.alloc(0) });
  check('empty file: refused before any write', empty.thrown?.message === 'evidence_invalid_size' && !wrote(empty.calls), empty.thrown?.message);

  const huge = await run({}, { ...PDF, bytes: Buffer.alloc(5 * 1024 * 1024 + 1) });
  check('oversize file: refused before any write', huge.thrown?.message === 'evidence_invalid_size' && !wrote(huge.calls), huge.thrown?.message);
}

// 8. hostile filenames cannot escape the organisation prefix
{
  const p = tenantEvidenceObjectPath(ORG, EV, 1, '../../org-b/secret.pdf');
  check('path traversal in filename is neutralised', p.startsWith(`${ORG}/${EV}/v1/`) && !p.includes('..') && p.split('/').length === 4, p);
}

console.log(`acceptance-83f1 runtime: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
