#!/usr/bin/env node
/**
 * Read-only hosted RI workflow evidence on staging. No writes, no paid AI.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';

const PUB = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const OBLIGATION = '63b84f23-9b4f-424a-96c9-f33eb3192779';
const OUT = join(REPO_ROOT, 'docs/eval/HOSTED-RI-WORKFLOW-UAT-2026-11-24.json');

function summarise(body) {
  if (!body || typeof body !== 'object') return { shape: typeof body };
  const arrays = {};
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) arrays[k] = v.length;
  }
  return {
    ok: body.ok ?? null,
    total: body.total ?? null,
    tenantScope: body.tenantScope ?? null,
    arrays,
    publicationDate: body.detail?.publication_date || body.labPublication?.publishedDate || null,
    publicationType: body.detail?.publication_type || body.labPublication?.publicationType || null,
    title: body.detail?.title || body.labPublication?.title || null,
    obligationStatus: body.obligation?.statusCode || body.obligation?.status || null,
    provenance: body.obligationProvenance || body.impactProvenance || null,
    error: body.error || body.code || body.message || null,
    orchestrationStatus: body.orchestration?.status || null,
    orchestrationBatches: Array.isArray(body.orchestration?.batches) ? body.orchestration.batches.length : null,
    keys: Object.keys(body).slice(0, 12),
  };
}

async function get(page, path) {
  const res = await page.request.get(`${STAGING_ORIGIN}${path}`);
  const body = await res.json().catch(() => null);
  return { path, http: res.status(), summary: summarise(body), sampleId: firstId(body) };
}

function firstId(body) {
  if (!body || typeof body !== 'object') return null;
  const lists = ['obligations', 'changes', 'risks', 'controls', 'actions', 'evidence', 'events', 'impactAssessments', 'notifications', 'findings'];
  for (const key of lists) {
    const row = Array.isArray(body[key]) ? body[key][0] : null;
    if (row?.id) return { list: key, id: row.id, status: row.statusCode || row.status || null };
  }
  return null;
}

const anon = await fetch(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}`, { headers: { accept: 'application/json' } });

const hosted = await runAs('A', async ({ page }) => {
  const paths = [
    `/api/ri-lab/publications/${PUB}`,
    '/api/ri-lab/catalogue/summary',
    `/api/ri-lab/publications/${PUB}/extraction-orchestration`,
    '/api/ri-lab/changes?scope=all',
    '/api/ri-lab/impact-assessments?scope=all',
    '/api/ri-lab/risks?scope=all',
    '/api/ri-lab/controls?scope=all',
    '/api/ri-lab/actions?scope=all',
    '/api/ri-lab/evidence?scope=all',
    '/api/ri-lab/notifications',
    '/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=' + OBLIGATION,
    '/api/ri-lab/reports/board',
    '/api/ri-lab/obligations?scope=all',
    `/api/ri-lab/obligations/${OBLIGATION}`,
    '/api/ri-lab/classification-policy?regulatorKey=REG-FCA',
  ];
  const rows = [];
  for (const path of paths) rows.push(await get(page, path));
  return rows;
});

const publication = hosted.find((r) => r.path.endsWith(PUB));
const obligation = hosted.find((r) => r.path.endsWith(OBLIGATION));
const report = {
  generatedAt: new Date().toISOString(),
  writesPerformed: false,
  paidAi: false,
  anonymousPublicationRead: { http: anon.status },
  modules: hosted,
  assertions: {
    publicationDate: publication?.summary?.publicationDate || null,
    publicationHttp: publication?.http,
    obligationHttp: obligation?.http,
  },
  notExecuted: [
    'New publication ingestion write',
    'New paid provision extraction',
    'New finding-review submission',
    'New maker-checker approval',
    'Cross-tenant negative (Users A/B/C share one staging organisation)',
  ],
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, anon: anon.status, modules: hosted.map((r) => ({ path: r.path, http: r.http, total: r.summary.total, sample: r.sampleId })) }, null, 2));
