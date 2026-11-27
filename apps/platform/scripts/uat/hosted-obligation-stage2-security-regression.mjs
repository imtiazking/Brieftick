#!/usr/bin/env node
/**
 * Hosted Stage 2 RPC security: maker-checker, REVIEWER content smuggling refusal, stale concurrent approval.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const RUN = `HOSTED-STAGE2-SEC-${Date.now().toString(36)}`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `hosted-stage2-security-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const results = [];
let obligationId = null;

async function api(page, method, path, data) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    timeout: 90_000,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
};

await requireUatPersonas(['A', 'B', 'C'], { label: 'hosted-stage2-security' });

await runAs('A', async ({ page }) => {
  const changes = await api(page, 'GET', '/api/ri-lab/changes?scope=all');
  const list = [
    ...(changes.body.changes || []),
    ...(changes.body.authorisedUatChanges || []),
    ...(changes.body.regulatoryChanges || []),
  ];
  const change = list.find((c) => c.id);
  if (!change?.id) {
    record('create obligation', false, 'no regulatory change');
    return;
  }
  const created = await api(page, 'POST', '/api/ri-lab/obligations', {
    regulatoryChangeId: change.id,
    obligationStatement: `${RUN} synthetic UAT obligation — not regulatory advice; hosted Stage 2 security regression only.`,
    citation: `${RUN}-CIT`,
    priority: 'LOW',
    regulatoryClassificationCode: 'R',
    legalBasis: `${RUN} synthetic legal basis for automated UAT only`,
    authoritativeProvision: {
      reference: `${RUN}-SYN`,
      quotation: `${RUN} synthetic quotation for UAT provision requirements only.`,
      sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CONC/4/2A.html',
    },
  });
  obligationId = created.body?.obligation?.id ?? created.body?.id;
  record('create obligation', (created.status === 200 || created.status === 201) && obligationId, {
    status: created.status,
    obligationId,
  });
  const cur = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
  const ob = cur.body?.obligation;
  const sub = await api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, {
    status: 'IN_REVIEW',
    expectedUpdatedAt: ob?.updatedAt,
  });
  record('A submit IN_REVIEW', sub.status === 200, { status: sub.status });
});

if (!obligationId) {
  writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ results }, null, 2));
  process.exit(1);
}

await runAs('B', async ({ page }) => {
  const cur = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
  const ob = cur.body?.obligation;
  const smuggle = await api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, {
    status: 'OPEN',
    priority: 'CRITICAL',
    citation: 'SMUGGLED-CITATION',
    expectedUpdatedAt: ob?.updatedAt,
  });
  const msg = JSON.stringify(smuggle.body || {});
  const refused = smuggle.status >= 400 || /segregation|insufficient|stale|forbidden|invalid/i.test(msg);
  record('B smuggle fields on approve refused', refused, { status: smuggle.status, msg: msg.slice(0, 200) });
});

await runAs('C', async ({ page }) => {
  const cur = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
  const ob = cur.body?.obligation;
  const a = api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, {
    status: 'OPEN',
    expectedUpdatedAt: ob?.updatedAt,
  });
  const b = api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, {
    status: 'OPEN',
    expectedUpdatedAt: ob?.updatedAt,
  });
  const settled = await Promise.allSettled([a, b]);
  const statuses = settled.map((s) => (s.status === 'fulfilled' ? s.value.status : 0));
  const okCount = statuses.filter((s) => s === 200).length;
  const staleCount = settled.filter(
    (s) => s.status === 'fulfilled' && (s.value.status === 409 || /stale/i.test(JSON.stringify(s.value.body))),
  ).length;
  record('concurrent C approvals: one wins or stale', okCount === 1 || staleCount >= 1, { statuses, bodies: settled.map((s) => (s.status === 'fulfilled' ? s.value.status : s.reason)) });
  const after = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
  const linked = after.body?.obligation?.stage2ImpactAssessment?.id || after.body?.obligation?.impacts?.length > 0;
  record('obligation has Stage 2 after approval', String(after.body?.obligation?.status).toUpperCase() === 'OPEN' && linked, {
    status: after.body?.obligation?.status,
    impact: Boolean(linked),
  });
});

const failed = results.filter((r) => !r.ok).length;
writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), obligationId, results }, null, 2));
process.exit(failed ? 1 : 0);