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
  // A check that is not driven through the browser must say so; only DOM-observed checks are 'hosted-browser'.
  const { layer = 'hosted-browser', ...rest } = detail;
  results.push({ id, layer, status, detail: rest });
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

/** Waits for a toast that differs from `previous`, so a stale toast from an earlier action is never read as the result. */
async function nextToast(page, previous) {
  await page.waitForFunction(
    (prior) => {
      const t = (document.querySelector('#ri-toast')?.innerText || '').trim();
      return t && t !== prior;
    },
    previous,
    { timeout: 30_000 },
  );
  return (await page.locator('#ri-toast').innerText()).trim();
}
const currentToast = async (page) => ((await page.locator('#ri-toast').innerText().catch(() => '')) || '').trim();

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

  // Let the record hydrate before editing: hydration rewrites the form fields, which would silently undo a value typed too early.
  await page.waitForFunction(() => /Owner:/.test(document.body.innerText), null, { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(2000);
  let prior = await currentToast(page);
  await page.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
  await page.locator('[data-connected-obligation-save]').click();
  const submitted = await nextToast(page, prior);
  // PASS needs the toast AND the persisted record (after a real reload) to show IN_REVIEW.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureLabReady(page);
  await page.locator('[data-connected-obligation-field="status"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const submittedStatus = await page.locator('[data-connected-obligation-field="status"]').inputValue();
  record('A-UI-SUBMIT-FOR-REVIEW', /saved/i.test(submitted) && submittedStatus === 'IN_REVIEW' ? 'PASS' : 'FAIL', { toast: submitted, persistedStatusAfterReload: submittedStatus });

  // Self-approval: the maker tries to approve their own submission in the UI. The result must be read from a NEW toast
  // and then confirmed against the persisted record after a reload (the form field can be locally edited).
  await page.waitForTimeout(1500);
  prior = await currentToast(page);
  await page.locator('[data-connected-obligation-field="status"]').fill('OPEN');
  await page.locator('[data-connected-obligation-save]').click();
  const self = await nextToast(page, prior);
  await page.waitForTimeout(1000);
  await shot(page, 'A-self-approval-refused.png');
  // Re-opening the same hash is not a navigation, so the form would still show the locally typed value. A real reload
  // re-reads the record from the server.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureLabReady(page);
  await page.locator('[data-connected-obligation-field="status"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const persisted = await page.locator('[data-connected-obligation-field="status"]').inputValue();
  record('A-UI-SELF-APPROVAL-REFUSED', persisted !== 'OPEN' && persisted === 'IN_REVIEW' && !/saved/i.test(self) ? 'PASS' : 'FAIL', { toast: self, persistedStatusAfterReload: persisted });
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
  const eventLog = [];
  const t0 = Date.now();
  page.on('request', (r) => { if (/workflow-events/.test(r.url())) eventLog.push(`+${Date.now() - t0}ms REQ ${new URL(r.url()).searchParams.get('entityType')}`); });
  page.on('response', (r) => { if (/workflow-events/.test(r.url())) eventLog.push(`+${Date.now() - t0}ms RES ${r.status()} ${new URL(r.url()).searchParams.get('entityType')}`); });
  page.on('requestfailed', (r) => { if (/workflow-events/.test(r.url())) eventLog.push(`+${Date.now() - t0}ms FAILED ${r.failure()?.errorText}`); });
  record('C-IDENTITY', identity.role === 'COMPLIANCE_MANAGER' ? 'PASS' : 'FAIL', { role: identity.role });
  await open(page, `#/obligation/${LIFECYCLE_OBLIGATION}`);
  const panel = page.locator('[data-connected-compliance-lifecycle]');
  const hasPanel = await panel.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  if (!hasPanel) {
    record('C-LIFECYCLE-PANEL', 'FAIL', { reason: 'five-stage lifecycle panel not rendered' });
    await shot(page, 'C-no-lifecycle-panel.png');
    return;
  }
  // The panel renders before the lifecycle payload arrives; wait for the stage links to hydrate before counting.
  await panel.locator('a.ri-lifecycle__link').first().waitFor({ timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1500);
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
  // Assurance page of the CLOSED review: its workflow state, audit history and control lineage must all be visible.
  if (assurance) {
    const assuranceHash = assurance.hash;
    await open(page, assuranceHash);
    const wf = (await page.locator('[data-connected-assurance-execution] strong').first().innerText().catch(() => '')).trim();
    record('C-ASSURANCE-WORKFLOW-STATE', wf === 'CLOSED' ? 'PASS' : 'FAIL', { shown: wf, expected: 'CLOSED' });
    const auditOk = await page
      .waitForFunction(
        () => {
          const panel = [...document.querySelectorAll('section.ri-panel')].find((s) => /Audit history/.test(s.textContent || ''));
          return panel && panel.querySelectorAll('tbody tr').length >= 5;
        },
        null,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
    const auditRows = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('section.ri-panel')].find((s) => /Audit history/.test(s.textContent || ''));
      return panel ? panel.querySelectorAll('tbody tr').length : -1;
    });
    const diagnostics = auditOk
      ? undefined
      : {
          eventRequests: eventLog,
          persistedAuditLoadState: await page.evaluate(() => {
            try {
              const s = JSON.parse(localStorage.getItem('forgeniq-ri-lab-v2') || '{}');
              const cat = s.connectedCatalogue || {};
              return {
                loadState: cat.entityWorkflowEventsLoadStateByKey || null,
                cachedEventCounts: Object.fromEntries(Object.entries(cat.entityWorkflowEventsByKey || {}).map(([k, v]) => [k, v.length])),
              };
            } catch (e) {
              return { error: String(e) };
            }
          }),
        };
    record('C-ASSURANCE-AUDIT-HISTORY', auditOk ? 'PASS' : 'FAIL', { rows: auditRows, expectedAtLeast: 5, ...(diagnostics ? { diagnostics } : {}) });
    // The audit history can render before the assurance detail request resolves; wait for the control link to hydrate.
    await page.locator('a[href^="#/control/"]').first().waitFor({ timeout: 20_000 }).catch(() => null);
    const controlLinks = await page.locator('a[href^="#/control/"]').count();
    record('C-ASSURANCE-LINKS-TO-CONTROL', controlLinks >= 1 ? 'PASS' : 'FAIL', { controlLinks });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'C-assurance-closed-state.png');
  }
  if (control) {
    await open(page, control.hash);
    const assuranceLinks = await page.locator('a[href^="#/assurance/"]').count();
    record('C-CONTROL-LINKS-TO-ASSURANCE', assuranceLinks >= 1 ? 'PASS' : 'FAIL', { assuranceLinks });
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

  // Phase 10: the regulatory calendar renders from the tenant API (not the demo seed or an Unavailable placeholder).
  await open(page, '#/calendar');
  const calStatus = page.locator('[data-connected-calendar-status]');
  const calShown = await calStatus.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  await page.waitForFunction(() => !/Loading tenant calendar/.test(document.querySelector('[data-connected-calendar-status]')?.textContent || ''), null, { timeout: 30_000 }).catch(() => null);
  const calText = calShown ? (await calStatus.innerText()).trim() : '';
  const calRows = await page.locator('[data-cal-item]').count();
  const calApi = await page.request.fetch(`${STAGING_ORIGIN}/api/ri-lab/calendar?window=365&dataScope=operational`);
  const calBody = await calApi.json().catch(() => ({}));
  record('C-CALENDAR-RENDERS-FROM-TENANT-API', calShown && /event\(s\) between|No dated regulatory events/.test(calText) ? 'PASS' : 'FAIL', { status: calText, rows: calRows });
  await shot(page, 'C-calendar.png');
  // Window selector re-queries the API, and the API refuses to widen on an unsupported window.
  await page.locator('[data-connected-calendar-window-select]').selectOption('365');
  await page.waitForFunction(() => /event\(s\) between|No dated regulatory events/.test(document.querySelector('[data-connected-calendar-status]')?.textContent || ''), null, { timeout: 30_000 }).catch(() => null);
  const calRows365 = await page.locator('[data-cal-item]').count();
  const bad = await (await page.request.fetch(`${STAGING_ORIGIN}/api/ri-lab/calendar?window=99999`)).json().catch(() => ({}));
  record('C-CALENDAR-WINDOW', calBody.ok === true && calApi.status() === 200 && calRows365 === calBody.total && bad.window === 90 ? 'PASS' : 'FAIL', {
    apiTotal365: calBody.total, rows365: calRows365, unsupportedWindowFellBackTo: bad.window,
    uatItemsHiddenFromOperational: calBody.events?.every((e) => e.dataProvenance !== 'uat_authorised') ?? null,
  });
  // API-level (NOT a browser check): the event path, title enrichment and provenance labels on real staging rows. The
  // Design Lab requests the operational scope only, so non-operational records can only be seen through scope=all.
  const allRes = await page.request.fetch(`${STAGING_ORIGIN}/api/ri-lab/calendar?window=365&dataScope=all`);
  const allBody = await allRes.json().catch(() => ({}));
  const tenantEvents = (allBody.events || []).filter((e) => e.recordType !== 'Publication');
  const placeholder = tenantEvents.filter((e) => /^(Assessment due|Obligation effective): [0-9a-f-]{36}$/i.test(e.title));
  record(
    'C-CALENDAR-API-SCOPE-ALL',
    allRes.status() === 200 && tenantEvents.length >= 1 && placeholder.length === 0 && tenantEvents.every((e) => ['operational', 'uat_authorised'].includes(e.dataProvenance)) && (allBody.total ?? 0) >= (calBody.total ?? 0) ? 'PASS' : 'FAIL',
    {
      layer: 'hosted-api',
      tenantEventsAll: tenantEvents.length,
      operationalTotal: calBody.total,
      byProvenance: tenantEvents.reduce((m, e) => ({ ...m, [e.dataProvenance]: (m[e.dataProvenance] || 0) + 1 }), {}),
      placeholderTitles: placeholder.length,
    },
  );
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
