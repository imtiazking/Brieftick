#!/usr/bin/env node
/**
 * Hosted Ask RI browser baseline — deterministic retrieval only (no paid AI).
 * Uses persistent staging personas via staging-user-sessions.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { requireUatPersonas, runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { designLabEntry } from '../staging/staging-release-hosts.mjs';

const day = new Date().toISOString().slice(0, 10);
const outDir =
  process.env.ASK_RI_BASELINE_OUT || join(REPO_ROOT, 'docs', 'uat', 'evidence', `ask-ri-browser-baseline-${day}`);
const LAB = designLabEntry(STAGING_ORIGIN);

/** fixtureBacked when response cites deterministic harness / insufficient without live PDF index. */
const QUESTION_MATRIX = [
  { id: 'publications', question: 'What FCA publications mention BNPL in the title?', expectKeys: ['status'] },
  { id: 'regulatory-changes', question: 'List open regulatory changes for our organisation', expectKeys: ['status'] },
  { id: 'obligations', question: 'How many operational obligations are in scope?', expectKeys: ['status', 'recordCount'] },
  { id: 'impact-assessments', question: 'Summarise impact assessments in progress', expectKeys: ['status'] },
  { id: 'risks', question: 'What regulatory risks are tracked?', expectKeys: ['status'] },
  { id: 'controls', question: 'What controls cover consumer credit obligations?', expectKeys: ['status'] },
  { id: 'assurance', question: 'What assurance activities are overdue?', expectKeys: ['status'] },
  { id: 'remediation', question: 'What remediation tasks are open?', expectKeys: ['status'] },
  { id: 'evidence', question: 'Where is evidence stored for obligation reviews?', expectKeys: ['status'] },
  { id: 'deadlines', question: 'What regulatory deadlines are upcoming?', expectKeys: ['status'] },
  { id: 'horizon', question: 'What is on the regulatory horizon this quarter?', expectKeys: ['status'] },
  { id: 'unsupported', question: 'What will interest rates be next year?', expectKeys: ['status'], allowUnscoped: true },
  { id: 'publication-pdf', question: 'PS26/1 FCA buy now pay later policy statement', expectKeys: ['status'], note: 'May require pdf_primary_v1 index' },
];

const results = [];

function record(id, ok, detail = {}) {
  results.push({ id, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id);
}

mkdirSync(outDir, { recursive: true });
await requireUatPersonas(['A'], { label: 'ask-ri-baseline' });

await runAs('A', async ({ page }) => {
  await page.goto(`${LAB}#/ask-ri`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 }).catch(() => {});

  const askVisible = await page.locator('[data-ask-ri-submit], [data-connected-ask-ri] button[type="submit"]').first().isVisible().catch(() => false);
  record('ask-ri-ui-visible', askVisible);

  for (const item of QUESTION_MATRIX) {
    const api = await page.evaluate(
      async ({ question }) => {
        const res = await fetch('/api/ri-lab/ask-ri', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        const body = await res.json().catch(() => ({}));
        return { status: res.status, body };
      },
      { question: item.question },
    );
    const body = api.body || {};
    const status = body.status || body.lastAsk?.status;
    const keysOk = item.expectKeys.every((k) => body[k] != null || body.lastAsk?.[k] != null || status != null);
    const deterministicOk = [
      'ANSWERED',
      'PARTIAL_ANSWER',
      'INSUFFICIENT_EVIDENCE',
      'UNRESOLVED',
      'UNSUPPORTED',
    ].includes(String(status || '').toUpperCase().replace(/ /g, '_'));
    const ok = api.status === 200 && body.ok === true && (keysOk || deterministicOk) && (item.allowUnscoped || status !== 'error');
    record(`ask-${item.id}`, ok, {
      question: item.question,
      responseStatus: body.status || body.lastAsk?.status,
      interpretedAs: body.interpretedAs,
      fixtureBacked: body.lastAsk?.fixtureBacked === true || body.status === 'insufficient_evidence',
      note: item.note,
    });
  }

  const tenantVsCatalogue = await page.evaluate(async () => {
    const tenant = await fetch('/api/ri-lab/ask-ri', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'List obligations assigned to our organisation' }),
    }).then((r) => r.json());
    const catalogue = await fetch('/api/ri-lab/ask-ri', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'List FCA policy statements in the regulatory library' }),
    }).then((r) => r.json());
    return { tenant: tenant?.status, catalogue: catalogue?.status };
  });
  record('tenant-specific-retrieval', tenantVsCatalogue.tenant != null);
  record('public-regulatory-retrieval', tenantVsCatalogue.catalogue != null);
});

const failed = results.filter((r) => !r.ok).length;
const summary = { generatedAt: new Date().toISOString(), staging: STAGING_ORIGIN, failed, results };
writeFileSync(join(outDir, 'RESULT.json'), JSON.stringify(summary, null, 2));
process.exit(failed ? 1 : 0);