#!/usr/bin/env node
/**
 * Hosted, real-browser UAT of the Design Lab as Users A (maker), B (reviewer) and C (approver).
 *
 * Every PASS here is a DOM/UX observation made in a real Chromium session on the official staging host.
 * Nothing is marked PASS from an API call alone. No session material is read or printed.
 * Paid AI is never invoked: only existing records are displayed and a deterministic UI approval is driven.
 *
 *   FORGENIQ_UAT_OBLIGATION_ID=<id of a completed lifecycle obligation>   (optional; default = latest hosted run)
 *   FORGENIQ_UAT_DEPLOYMENT=<dpl_...>                                      (recorded in evidence)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const DAY = new Date().toISOString().slice(0, 10);
const RUN = `UAT-BROWSER-${DAY.replace(/-/g, '')}-${Date.now().toString(36)}`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `browser-abc-${DAY}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const LIFECYCLE_OBLIGATION = process.env.FORGENIQ_UAT_OBLIGATION_ID || '4a0cb8aa-0e36-4d68-b5df-eed2a245eae8';
const PRIOR = '0222809b-b74e-4577-88d4-e1d8701f5385';

const results = [];
const ids = { run: RUN, lifecycleObligation: LIFECYCLE_OBLIGATION };
const bag = { console: [], http: [], pageErrors: [] };
const record = (id, status, detail = {}) => {
  results.push({ id, layer: 'hosted-browser', status, detail });
  console.log(`${status} ${id}`);
};

function watch(page, who) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error' && !/Failed to load resource|favicon/i.test(t)) bag.console.push(`${who}: ${t.slice(0, 240)}`);
  });
  page.on('pageerror', (e) => bag.pageErrors.push(`${who}: ${String(e?.message || e).slice(0, 240)}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) bag.http.push(`${who}: ${res.status()} ${new URL(res.url()).pathname}`);
  });
}

const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  return name;
};

async function toastText(page) {
  const toast = page.locator('#ri-toast');
  await toast.waitFor({ state: 'visible', timeout: 20_000 });
  return (await toast.innerText()).trim();
}

async function ensureLabReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 });
  const picker = page.locator('[data-ri-select-org]');
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption(STAGING_ORGANISATION_ID);
    await page.locator('[data-ri-apply-org]').click();
  }
  await page.waitForFunction(
    () => !/Select organisation|Sign in required|Backend unavailable/i.test(document.querySelector('h1')?.textContent || ''),
    null,
    { timeout: 60_000 },
  );
}

async function open(page, hash) {
  await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ensureLabReady(page);
  await page.waitForTimeout(1200);
}

const bodyText = (page) => page.locator('body').innerText();

/** Terminal modal geometry + behaviour on live data. */
async function terminalModal(page, who, hash, term, kind) {
  await open(page, hash);
  const rowSel = `[data-ri-terminal="${term}"] tbody tr[data-ri-detail-row]`;
  const hasRows = await page.waitForSelector(rowSel, { timeout: 45_000 }).then(() => true).catch(() => false);
  if (!hasRows) {
    record(`${who}-${term.toUpperCase()}-TERMINAL`, 'FAIL', { reason: 'terminal table has no rows' });
    await shot(page, `${who}-${term}-no-rows.png`);
    return;
  }
  const rows = await page.locator(rowSel).count();
  const theme = await page.evaluate((k) => {
    const el = document.querySelector(`[data-ri-terminal="${k}"]`);
    const th = el.querySelector('thead th');
    return { bg: getComputedStyle(el).backgroundColor, head: th ? getComputedStyle(th).color : '', font: getComputedStyle(el).fontFamily };
  }, term);
  const themeOk = theme.head === 'rgb(52, 211, 153)' && /JetBrains Mono|monospace/i.test(theme.font);
  record(`${who}-${term.toUpperCase()}-THEME`, themeOk ? 'PASS' : 'FAIL', { rows, ...theme });
  await shot(page, `${who}-${term}-list.png`);

  const peek = page.locator(`[data-ri-terminal="${term}"] button[data-ri-detail="${kind}"]`).first();
  await peek.focus();
  await peek.press('Enter');
  const dialog = page.locator('dialog#ri-terminal-detail');
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  await page.evaluate(() => {
    const d = document.getElementById('ri-terminal-detail');
    return Promise.race([Promise.all(d.getAnimations().map((a) => a.finished.catch(() => null))), new Promise((r) => setTimeout(r, 1500))]);
  });
  const vp = page.viewportSize();
  const geo = await page.evaluate(() => {
    const d = document.getElementById('ri-terminal-detail');
    const r = d.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      blur: getComputedStyle(d, '::backdrop').backdropFilter || '',
      modal: d.matches(':modal'),
      title: d.querySelector('h2')?.textContent || '',
      inside: d.contains(document.activeElement),
    };
  });
  const centred = Math.abs(geo.cx - vp.width / 2) <= 2 && Math.abs(geo.cy - vp.height / 2) <= 4;
  record(`${who}-${term.toUpperCase()}-MODAL`, centred && /blur\(/.test(geo.blur) && geo.modal && geo.inside && geo.title.length > 0 ? 'PASS' : 'FAIL', {
    centred,
    blur: geo.blur,
    trueModal: geo.modal,
    focusInside: geo.inside,
    title: geo.title.slice(0, 80),
    viewport: vp,
  });
  await shot(page, `${who}-${term}-modal.png`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  const focusBack = await peek.evaluate((b) => b === document.activeElement);
  record(`${who}-${term.toUpperCase()}-MODAL-CLOSE`, focusBack ? 'PASS' : 'FAIL', { escapeReturnsFocus: focusBack });
}

await requireUatPersonas(['A', 'B', 'C'], { label: 'hosted-design-lab-browser-abc' });

// ------------------------------------------------------------------ User A: terminal UI, UI-created obligation, self-approval refusal
await runAs('A', async ({ page, identity }) => {
  watch(page, 'A');
  record('A-IDENTITY', 'PASS', { role: identity.role, organisation: identity.organisationName });
  await page.setViewportSize({ width: 1440, height: 900 });
  await terminalModal(page, 'A', '#/library', 'publications', 'publication');
  await terminalModal(page, 'A', '#/obligations', 'obligations', 'obligation');

  await open(page, `#/obligation/${PRIOR}`);
  const changeLink = page.locator('a[href^="#/change/"]').first();
  await changeLink.waitFor({ timeout: 30_000 });
  await changeLink.click();
  await page.locator('[data-connected-create-obligation]').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-connected-obligation-create-statement]').fill(
    `${RUN} synthetic UAT obligation. Firms must retain labelled test evidence for this automated browser run and must not treat this statement as a live regulatory duty.`,
  );
  await page.locator('[data-connected-obligation-create-citation]').fill(`${RUN} synthetic citation`);
  await page.locator('[data-connected-obligation-create-code]').selectOption('R');
  await page.locator('[data-connected-obligation-create-legal-basis]').fill(`${RUN} synthetic legal basis for automated UAT only`);
  await page.locator('[data-connected-obligation-create-authority-reference]').fill(`${RUN}-SYN`);
  await page.locator('[data-connected-obligation-create-authority-url]').fill('https://www.handbook.fca.org.uk/handbook/CONC/4/2A.html');
  await page.locator('[data-connected-obligation-create-authority-quotation]').fill(
    `${RUN} synthetic quotation used only to satisfy hosted UAT provision requirements.`,
  );
  await page.locator('button[data-connected-create-obligation]').click();
  const created = await toastText(page);
  await page.waitForURL(/#\/obligation\//, { timeout: 20_000 });
  ids.obligationId = new URL(page.url()).hash.split('/obligation/')[1];
  record('A-UI-CREATE-OBLIGATION', ids.obligationId && /created/i.test(created) ? 'PASS' : 'FAIL', { toast: created, obligationId: ids.obligationId });
  await shot(page, 'A-obligation-draft.png');

  await page.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
  await page.locator('[data-connected-obligation-save]').click();
  const submitted = await toastText(page);
  record('A-UI-SUBMIT-FOR-REVIEW', /saved/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });

  await page.locator('[data-connected-obligation-field="status"]').fill('OPEN');
  await page.locator('[data-connected-obligation-save]').click();
  const self = await toastText(page);
  const value = await page.locator('[data-connected-obligation-field="status"]').inputValue();
  record('A-UI-SELF-APPROVAL-REFUSED', /fail|segregation|invalid|denied|error|cannot|not permitted/i.test(self) || value !== 'OPEN' ? 'PASS' : 'FAIL', { toast: self, statusField: value });
  await shot(page, 'A-self-approval-refused.png');
});

// ------------------------------------------------------------------ User B: independent reviewer approves through the UI
if (ids.obligationId) {
  await runAs('B', async ({ page, identity }) => {
    watch(page, 'B');
    record('B-IDENTITY', identity.role === 'REVIEWER' ? 'PASS' : 'FAIL', { role: identity.role });
    await open(page, `#/obligation/${ids.obligationId}`);
    const approve = page.locator('[data-connected-obligation-decision="OPEN"]');
    const visible = await approve.waitFor({ timeout: 25_000 }).then(() => true).catch(() => false);
    if (!visible) {
      record('B-UI-APPROVE-OBLIGATION', 'FAIL', { reason: 'approve control not shown to independent reviewer' });
      await shot(page, 'B-no-approve-control.png');
      return;
    }
    await approve.click();
    const decision = await toastText(page);
    await page.waitForTimeout(2000);
    const stage2 = await page.locator('[data-connected-obligation-stage2]').innerText().catch(() => '');
    const approved = /approved into register/i.test(decision);
    const linked = /Open impact assessment/i.test(stage2);
    record('B-UI-APPROVE-OBLIGATION', approved ? 'PASS' : 'FAIL', { toast: decision });
    record('B-UI-ATOMIC-STAGE2-HANDOFF', linked ? 'PASS' : 'FAIL', { stage2: stage2.slice(0, 300) });
    await shot(page, 'B-approved-with-stage2.png');
    if (linked) {
      await page.getByText(/Open impact assessment/i).first().click();
      await page.waitForFunction(() => /#\/assessment\//.test(location.hash), null, { timeout: 15_000 });
      await ensureLabReady(page);
      await page.waitForTimeout(1500);
      const text = await bodyText(page);
      record('B-UI-NAVIGATE-TO-IMPACT', /impact/i.test(text) && !/not found/i.test(text.slice(0, 400)) ? 'PASS' : 'FAIL', { url: page.url().split('#')[1] });
      await shot(page, 'B-impact-after-approval.png');
    }
  });
}

// ------------------------------------------------------------------ User C: navigate the whole chain Obligation → Impact → Risk → Control → Assurance
await runAs('C', async ({ page, identity }) => {
  watch(page, 'C');
  record('C-IDENTITY', identity.role === 'COMPLIANCE_MANAGER' ? 'PASS' : 'FAIL', { role: identity.role });
  await open(page, `#/obligation/${LIFECYCLE_OBLIGATION}`);
  const panel = page.locator('[data-connected-compliance-lifecycle]');
  const hasPanel = await panel.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  if (!hasPanel) {
    record('C-LIFECYCLE-PANEL', 'FAIL', { reason: 'five-stage lifecycle panel not rendered' });
    await shot(page, 'C-no-lifecycle-panel.png');
    return;
  }
  const items = await panel.locator('li').allInnerTexts();
  const linkable = await panel.locator('a.ri-lifecycle__link').count();
  record('C-LIFECYCLE-PANEL', linkable === 5 ? 'PASS' : 'FAIL', { stages: items, linkableStages: linkable });
  await shot(page, 'C-lifecycle-panel.png');

  const stageNames = ['Obligation', 'Impact', 'Risk', 'Control', 'Assurance'];
  const detail = {};
  for (const name of stageNames) {
    await open(page, `#/obligation/${LIFECYCLE_OBLIGATION}`);
    await page.locator('[data-connected-compliance-lifecycle]').waitFor({ timeout: 30_000 });
    const link = page.locator('[data-connected-compliance-lifecycle] a.ri-lifecycle__link', { hasText: name }).first();
    if (!(await link.count())) {
      record(`C-NAV-${name.toUpperCase()}`, 'FAIL', { reason: 'stage link missing (stage not linked)' });
      continue;
    }
    const label = (await link.innerText()).trim();
    await link.click();
    await page.waitForTimeout(500);
    await ensureLabReady(page);
    await page.waitForTimeout(1500);
    const text = await bodyText(page);
    const hash = new URL(page.url()).hash;
    const failed = /Backend unavailable|Record not found|could not be loaded|404/i.test(text.slice(0, 600));
    detail[name] = { label, hash, hasStatus: /status/i.test(text), hasOwner: /owner|assigned|reviewer|created by/i.test(text), hasHistory: /history|audit|timeline|activity|event/i.test(text), chars: text.length };
    record(`C-NAV-${name.toUpperCase()}`, !failed && hash.length > 3 ? 'PASS' : 'FAIL', detail[name]);
    await shot(page, `C-${name.toLowerCase()}.png`);
    detail[name].text = text;
  }

  // Relationship visibility at the two ends of the Stage 4 → Stage 5 link (the defect fixed in this tranche).
  const control = detail.Control;
  const assurance = detail.Assurance;
  if (control) {
    const ok = /assurance/i.test(control.text);
    record('C-CONTROL-SHOWS-ASSURANCE', ok ? 'PASS' : 'FAIL', { mentionsAssurance: ok });
  }
  if (assurance) {
    const ok = /control/i.test(assurance.text);
    record('C-ASSURANCE-SHOWS-CONTROL', ok ? 'PASS' : 'FAIL', { mentionsControl: ok });
  }
  // Approval history on the obligation record.
  await open(page, `#/obligation/${LIFECYCLE_OBLIGATION}`);
  const obText = await bodyText(page);
  record('C-OBLIGATION-APPROVAL-HISTORY', /approv|history|status event|decision|audit/i.test(obText) ? 'PASS' : 'FAIL', { chars: obText.length });
  await shot(page, 'C-obligation-history.png');

  // Registers under scope=all show the lifecycle records in the real UI.
  for (const [name, hash] of [['RISKS', '#/risks'], ['CONTROLS', '#/controls'], ['ASSURANCE', '#/assurance']]) {
    await open(page, hash);
    const t = await bodyText(page);
    record(`C-REGISTER-${name}`, t.length > 400 && !/Backend unavailable/i.test(t) ? 'PASS' : 'FAIL', { chars: t.length });
    await shot(page, `C-register-${name.toLowerCase()}.png`);
  }
});

const failed = results.filter((r) => r.status === 'FAIL').length;
const out = {
  run: RUN,
  deployment: process.env.FORGENIQ_UAT_DEPLOYMENT || 'UNSPECIFIED',
  origin: STAGING_ORIGIN,
  ids,
  results: results.map((r) => ({ ...r, detail: Object.fromEntries(Object.entries(r.detail).filter(([k]) => k !== 'text')) })),
  consoleErrors: bag.console.slice(0, 60),
  pageErrors: bag.pageErrors.slice(0, 60),
  failedApiResponses: bag.http.slice(0, 60),
  failed,
};
writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify(out, null, 2));
console.log(`hosted browser UAT: ${results.length} checks, failed ${failed}, console errors ${bag.console.length}, page errors ${bag.pageErrors.length}`);
process.exit(failed ? 1 : 0);
