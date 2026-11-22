#!/usr/bin/env node
/**
 * PS22/9 run 3ed8c3e2 — binding PRIN 2A.4.34R + evidential 2A.4.35E (not 2A.4.13R / 68051a63).
 *   node scripts/uat/ps22-evidential-binding-correction.mjs refusal-probe
 *   node scripts/uat/ps22-evidential-binding-correction.mjs convert <runId>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const RUN_ID = process.argv[3] || '3ed8c3e2-162c-4be9-868e-b123e6a46288';
const WRONG_OBL = '68051a63-ea05-45b5-bbef-4fdc94b1ae45';
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-EVIDENTIAL-BINDING-CORRECTION-2026-11-22.json');
const log = [];

/** Authoritative PS22/9 instrument text (p.126 per FCA 2022/31 pagination in PDF). */
const QUOTE_34R =
  'A manufacturer of a funeral plan product which is a closed product and was manufactured before 29 July 2022 must apply the closed product rules and guidance in PRIN 2A.4.';
const QUOTE_35E =
  'Where a manufacturer of a closed product which is a funeral plan product manufactured before 29 July 2022 is following the provisions of PROD 7 concerning the fair value of funeral plan products, contravention of PROD 7 may be relied on as tending to establish contravention of those provisions of PRIN 2A.4 that apply to the firm.';
const STMT_35E =
  'Contravention of PROD 7 may be relied on as tending to establish contravention of those provisions of PRIN 2A.4 that apply to the firm.';
const INSTRUMENT_PAGE = 126;

const groundedStmt = (quotation, preferred) => {
  const q = quotation.replace(/\s+/g, ' ').trim();
  const p = (preferred || q).replace(/\s+/g, ' ').trim();
  return p.length <= q.length ? p : q.slice(0, Math.min(q.length, 220));
};

const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  mkdirSync(resolve(process.cwd(), '..', '..', 'docs', 'eval'), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify({ log }, null, 2));
};

async function refusalProbe() {
  return runAs('B', async ({ page }) => {
    const list = await loadFindings(page, RUN_ID);
    const f35 = list.find((f) => (f.sections || []).some((s) => (s.provisionsSetOut || []).includes('2A.4.35E')));
    if (!f35) throw new Error('no 35E finding');
    const quote = QUOTE_35E;
    const stmt = groundedStmt(quote, STMT_35E);
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${RUN_ID}/findings`, {
      data: {
        notes: 'refusal probe — E must not link to unrelated 2A.4.13R obligation',
        decisions: [
          {
            findingId: f35.findingId,
            claimTextSha256: f35.claimTextSha256,
            decision: 'ACCEPTED',
            regulatoryClassificationCode: 'E',
            disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
            provisionReference: 'PRIN 2A.4.35E',
            provisionFunction: 'EVIDENTIAL_PROVISION',
            legalBasis: 'FCA Handbook PRIN 2A.4.35E',
            quotation: quote,
            quotationPage: INSTRUMENT_PAGE,
            obligationStatement: stmt,
            supportingObligationId: WRONG_OBL,
            comment: 'Negative test: 35E must not link to PRIN 2A.4.13R obligation 68051a63.',
          },
        ],
      },
    });
    const body = await res.json().catch(() => ({}));
    record('refusal-probe', { httpStatus: res.status(), body });
    if (res.status() === 400) return { refused: true, detail: body.detail || body.error };
    if (res.status() === 409) return { refused: true, detail: 'already_reviewed', note: 'run closed — use fresh run for another negative API probe' };
    throw new Error(`expected refusal, got ${res.status()}`);
  });
}

async function loadFindings(page, runId) {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin' });
    const body = await res.json();
    return body.findings || [];
  }, runId);
}

async function convertViaApi(runId) {
  return runAs('B', async ({ page, identity }) => {
    const list = await loadFindings(page, runId);
    const f34 = list.find((f) => f.number === 19) || list.find((f) => (f.suggestion?.citation || '').includes('2A.4.34'));
    const f35 = list.find((f) => (f.sections || []).some((s) => (s.provisionsSetOut || []).includes('2A.4.35E')));
    record('inspect-api', { f34: f34?.findingId, f35: f35?.findingId });
    if (!f34 || !f35) throw new Error('missing 34R or 35E finding');
    const quote34 = QUOTE_34R;
    const quote35 = QUOTE_35E;
    const stmt35 = groundedStmt(quote35, STMT_35E);
    const decisions = list.map((f) => {
      if (f.findingId === f34.findingId) {
        return {
          findingId: f.findingId,
          claimTextSha256: f.claimTextSha256,
          decision: 'ACCEPTED',
          regulatoryClassificationCode: 'R',
          provisionFunction: 'OPERATIVE_REQUIREMENT',
          disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
          provisionReference: 'PRIN 2A.4.34R',
          legalBasis: 'FCA Handbook PRIN 2A.4.34R, PS22/9',
          quotation: quote34,
          quotationPage: INSTRUMENT_PAGE,
          obligationStatement: groundedStmt(quote34),
          comment: 'Binding PRIN 2A.4.34R for 35E evidential link (not 2A.4.13R / 68051a63).',
        };
      }
      if (f.findingId === f35.findingId) {
        return {
          findingId: f.findingId,
          claimTextSha256: f.claimTextSha256,
          decision: 'ACCEPTED',
          regulatoryClassificationCode: 'E',
          provisionFunction: 'EVIDENTIAL_PROVISION',
          disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
          provisionReference: 'PRIN 2A.4.35E',
          legalBasis: 'FCA Handbook PRIN 2A.4.35E, PS22/9',
          quotation: quote35,
          quotationPage: INSTRUMENT_PAGE,
          obligationStatement: stmt35,
          supportingFindingId: f34.findingId,
          comment: 'E conversion linked to binding 34R finding in same review.',
        };
      }
      return {
        findingId: f.findingId,
        claimTextSha256: f.claimTextSha256,
        decision: 'REJECTED',
        comment: 'Out of scope for evidential binding correction.',
      };
    });
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}/findings`, {
      data: { notes: 'P3 evidential binding correction — 34R + 35E', decisions },
    });
    const body = await res.json().catch(() => ({}));
    record('review-api', { actor: identity.userId, httpStatus: res.status(), body });
    if (res.status() >= 400) throw new Error(JSON.stringify(body));
    return body;
  });
}

async function convertRun(runId) {
  return runAs('B', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/ai-analysis/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-finding-review-item]', { timeout: 120_000 });
    const insp = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin' });
      const body = await res.json();
      const list = body.findings || [];
      const f34 = list.find((f) => f.number === 19) || list.find((f) => (f.suggestion?.citation || '').includes('2A.4.34'));
      const f35 = list.find((f) => (f.sections || []).some((s) => (s.provisionsSetOut || []).includes('2A.4.35E')));
      return { f34: f34 && { n: f34.number, id: f34.findingId, sha: f34.claimTextSha256, quote: f34.suggestion?.sourceQuotation?.slice(0, 200) }, f35: f35 && { n: f35.number, id: f35.findingId, sha: f35.claimTextSha256 } };
    }, runId);
    record('inspect', insp);
    if (!insp.f34 || !insp.f35) throw new Error('missing 34R or 35E finding');
    const n34 = insp.f34.n;
    const n35 = insp.f35.n;
    const c34 = page.locator(`[data-finding-review-item][data-finding-number="${n34}"]`);
    await c34.locator('[data-finding-decision][value="ACCEPTED"]').check();
    await c34.locator('[data-finding-code]').selectOption('R');
    await c34.locator('[data-finding-provision-function]').selectOption('OPERATIVE_REQUIREMENT');
    await c34.locator('[data-finding-provision-reference]').fill('PRIN 2A.4.34R');
    await c34.locator('[data-finding-disposition]').selectOption('CONVERT_TO_DRAFT_OBLIGATION');
    await c34.locator('[data-finding-legal-basis]').fill('FCA Handbook PRIN 2A.4.34R, PS22/9');
    await c34.locator('[data-finding-quotation]').fill(insp.f34.quote || 'Closed funeral plan products');
    await c34.locator('[data-finding-obligation-statement]').fill('Closed funeral plan product rules apply as specified in PRIN 2A.4.34R.');
    await c34.locator('[data-finding-comment]').fill('Binding PRIN 2A.4.34R for 35E evidential link (not 2A.4.13R).');
    const c35 = page.locator(`[data-finding-review-item][data-finding-number="${n35}"]`);
    await c35.locator('[data-finding-decision][value="ACCEPTED"]').check();
    await c35.locator('[data-finding-code]').selectOption('E');
    await c35.locator('[data-finding-provision-function]').selectOption('EVIDENTIAL_PROVISION');
    await c35.locator('[data-finding-provision-reference]').fill('PRIN 2A.4.35E');
    await c35.locator('[data-finding-disposition]').selectOption('CONVERT_TO_DRAFT_OBLIGATION');
    await c35.locator('[data-finding-legal-basis]').fill('FCA Handbook PRIN 2A.4.35E, PS22/9');
    await c35.locator('[data-finding-reclassification]').fill('35E evidential — tends to establish contravention of PRIN 2A.4.34R / 2A.4.2R block, not 2A.4.13R.');
    await c35.locator('[data-finding-supporting-finding]').selectOption(insp.f34.id);
    await c35.locator('[data-finding-comment]').fill('E conversion linked to binding finding in same review.');
    const count = await page.locator('[data-finding-review-item]').count();
    for (let i = 1; i <= count; i++) {
      if (i === n34 || i === n35) continue;
      const c = page.locator(`[data-finding-review-item][data-finding-number="${i}"]`);
      await c.locator('[data-finding-decision][value="REJECTED"]').check();
      await c.locator('[data-finding-comment]').fill('Out of scope for evidential binding correction.');
    }
    const result = await act('review ps22 binding+e', async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(`/ai-analysis-runs/${runId}/findings`) && r.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.locator('[data-finding-review-submit]').click();
      const response = await responsePromise;
      return { httpStatus: response.status(), ...(await response.json().catch(() => ({}))) };
    });
    record('review', { actor: identity.userId, result });
    return result;
  });
}

const BINDING_OBL = process.env.PS22_BINDING_OBL || '2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a';
const EVIDENTIAL_OBL = process.env.PS22_EVIDENTIAL_OBL || '7143f1ff-c064-4123-bc2e-38e0102972df';

async function approvePair() {
  for (const id of [BINDING_OBL, EVIDENTIAL_OBL]) {
    await runAs('A', async ({ page, act }) => {
      await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
      const panel = page.locator(`[data-connected-obligation-panel="${id}"]`);
      await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
      await act(`submit ${id.slice(0, 8)}`, () => panel.locator('[data-connected-obligation-save]').click());
    });
  }
  for (const id of [BINDING_OBL, EVIDENTIAL_OBL]) {
    await runAs('C', async ({ page, identity, act }) => {
      await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
      const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${id}"]`);
      await btn.waitFor({ timeout: 60_000 });
      await act(`approve ${id.slice(0, 8)}`, () => btn.click());
      record('approve', { actor: identity.userId, obligationId: id });
    });
  }
  await runAs('A', async ({ page }) => {
    const e = (await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/obligations/${EVIDENTIAL_OBL}`)).json()).obligation;
    const ok = e.supportsObligationId === BINDING_OBL && e.supportsObligationId !== WRONG_OBL;
    record('verify-link', { supportsObligationId: e.supportsObligationId, ok, wrongLink: WRONG_OBL });
    if (!ok) throw new Error('E obligation link incorrect');
  });
  return record('complete-approve', { binding: BINDING_OBL, evidential: EVIDENTIAL_OBL });
}

const cmd = process.argv[2];
if (cmd === 'refusal-probe') refusalProbe().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'convert') convertRun(RUN_ID).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'convert-api') convertViaApi(RUN_ID).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'approve') approvePair().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
else console.error('usage: refusal-probe | convert | convert-api | approve [runId]');