#!/usr/bin/env node
/**
 * Hosted lineage: catalogue publication → feed/horizon/library/changes/triage (read-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `regulatory-lineage-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });

const MOCI_PUBLICATION_ID = '0a88c11f-f0fe-4f15-bce0-9ff3a06b2486';
const MOCI_INGESTION_RUN_ID = '4cac5a4c-7a76-46ab-89c1-27ff08523825';
const FCA_PUBLICATION_WITH_CHANGE = '829c5472-953a-40ff-9628-947afbfe4e7a';
const MOCI_SOURCE = 'SRC-MOCI-SA-COMPANIES-LAW';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200));
};

async function api(page, method, path, data) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    timeout: 90_000,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

await requireUatPersonas(['C'], { label: 'regulatory-lineage' });
await runAs('C', async ({ page }) => {
  const pubsRes = await api(page, 'GET', '/api/ri-lab/publications?limit=50');
  const pubs = pubsRes.body?.publications || [];
  const mociPub = pubs.find((p) => p.id === MOCI_PUBLICATION_ID) || pubs.find((p) => /moci|companies law/i.test(`${p.title}`));
  check('publications API lists MOCI catalogue row', pubsRes.status === 200 && Boolean(mociPub?.id), {
    status: pubsRes.status,
    mociPublicationId: mociPub?.id,
  });

  const mociDetail = await api(page, 'GET', `/api/ri-lab/publications/${MOCI_PUBLICATION_ID}`);
  const trace = mociDetail.body?.regulatoryTrace;
  check('MOCI regulatoryTrace: ingestion run from provenance', mociDetail.status === 200 && trace?.ingestionRunId === MOCI_INGESTION_RUN_ID, {
    status: mociDetail.status,
    ingestionRunId: trace?.ingestionRunId,
    sourceExternalKey: trace?.sourceExternalKey,
  });
  check('MOCI regulatoryTrace: no tenant change (legitimate)', trace?.regulatoryChange?.linkage === 'NONE', {
    linkage: trace?.regulatoryChange?.linkage,
    changeIds: trace?.regulatoryChange?.changeIds,
  });

  const fcaDetail = await api(page, 'GET', `/api/ri-lab/publications/${FCA_PUBLICATION_WITH_CHANGE}`);
  const fcaTrace = fcaDetail.body?.regulatoryTrace;
  check('FCA PS26/1 regulatoryTrace: tenant change linked', fcaDetail.status === 200 && fcaTrace?.regulatoryChange?.linkage === 'TENANT_CHANGE', {
    linkage: fcaTrace?.regulatoryChange?.linkage,
    primaryChangeId: fcaTrace?.regulatoryChange?.primaryChangeId,
  });

  const changes = await api(page, 'GET', '/api/ri-lab/changes?scope=all&limit=50');
  const changeList = changes.body?.changes || [];
  const pubLinkedChange = changeList.find((c) => c.publicationId === FCA_PUBLICATION_WITH_CHANGE);
  check('changes API publicationId forward link (FCA)', Boolean(pubLinkedChange), {
    changeId: pubLinkedChange?.id,
    publicationId: pubLinkedChange?.publicationId,
  });

  const landscape = await api(page, 'GET', '/api/ri-lab/landscape');
  check('landscape / horizon data API', landscape.status === 200, { status: landscape.status });

  const triage = await api(page, 'GET', '/api/ri-lab/triage?queue=ALL_FINDINGS&page=1&pageSize=5');
  check('findings triage API', triage.status === 200, { status: triage.status, total: triage.body?.total ?? triage.body?.count });

  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/feed`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 25_000 }).catch(() => {});
  await page
    .waitForFunction(() => document.querySelectorAll('[data-feed-item]').length > 0, null, { timeout: 120_000 })
    .catch(() => {});
  const feedH1 = await page.locator('h1').first().innerText().catch(() => '');
  const feedItems = await page.locator('[data-feed-item]').count();
  check('regulatory feed UI (catalogue-backed)', /regulatory feed/i.test(feedH1) && feedItems > 0, { feedItems });

  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/publication/${MOCI_PUBLICATION_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  const pubH1 = await page.locator('h1').first().innerText().catch(() => '');
  check('publication detail route (MOCI)', pubH1.length > 3 && !/page not found/i.test(pubH1), pubH1.slice(0, 80));

  results.push({ name: 'sourceUnderTest', ok: true, detail: MOCI_SOURCE });
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), origin: STAGING_ORIGIN, results }, null, 2));
const failed = results.filter((r) => r.ok === false).length;
process.exit(failed ? 1 : 0);