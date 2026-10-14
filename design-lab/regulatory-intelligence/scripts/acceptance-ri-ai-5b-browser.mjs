/**
 * Browser acceptance for Compliance Workflow AI 5B (requires serve on :3000).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=ai-5b-browser';
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function applyDemoUser(page, userId) {
  await page.goto(`${BASE}#/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.selectOption('#demo-user-select', userId);
  await page.click('#save-demo-user');
  await page.waitForTimeout(400);
}

async function main() {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await applyDemoUser(page, 'u-reed');
  await page.goto(`${BASE}#/publication/PUB-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  pass('change-panel', (await page.locator('[data-ai-change-panel]').count()) === 1);
  await page.click('[data-ai-change-analyse]');
  await page.waitForTimeout(2500);
  const chgBody = await page.locator('[data-ai-wf-result]').innerText();
  pass('change-ai-fixture', chgBody.includes('AI FIXTURE'));
  pass('change-human-review', chgBody.includes('HUMAN_REVIEW_REQUIRED'));
  pass('change-evidence', /Evidence confidence/i.test(chgBody));

  const chgBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).changes?.length : 0;
  });
  await page.click('[data-ai-wf-accept]');
  await page.waitForTimeout(800);
  const chgAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).changes?.length : 0;
  });
  pass('create-draft-change', chgAfter > chgBefore);

  await page.goto(`${BASE}#/change/CHG-003`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  pass('ia-panel', (await page.locator('[data-ai-ia-panel]').count()) === 1);
  await page.click('[data-ai-ia-generate]');
  await page.waitForTimeout(2500);
  const iaBody = await page.locator('[data-ai-ia-panel] [data-ai-wf-result]').innerText();
  pass('ia-fixture', iaBody.includes('AI FIXTURE'));
  pass('ia-policy-risk-hint', /policy|risk|control/i.test(iaBody));

  const iaBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).assessments?.length : 0;
  });
  await page.locator('[data-ai-ia-panel] [data-ai-wf-accept]').click();
  await page.waitForTimeout(800);
  const iaAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).assessments?.length : 0;
  });
  pass('create-draft-ia', iaAfter >= iaBefore);

  await page.goto(`${BASE}#/assessment/IA-0031`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.click('[data-ai-obl-generate]');
  await page.waitForTimeout(2500);
  const oblBody = await page.locator('[data-ai-obl-panel] [data-ai-wf-result]').innerText();
  pass('obl-fixture', oblBody.includes('AI FIXTURE'));
  const oblBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).obligations?.length : 0;
  });
  await page.locator('[data-ai-obl-panel] [data-ai-wf-accept]').click();
  await page.waitForTimeout(800);
  const oblAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    return raw ? JSON.parse(raw).obligations?.length : 0;
  });
  pass('create-draft-obligation', oblAfter > oblBefore);

  await applyDemoUser(page, 'u-cole');
  await page.goto(`${BASE}#/publication/PUB-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  pass('auditor-no-analyse', (await page.locator('[data-ai-change-analyse]').count()) === 0);

  for (const w of [1280, 1024, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    pass(`no-overflow-${w}`, !ov);
  }

  const materialErrors = errors.filter(
    (e) => !/ERR_CONNECTION_REFUSED|127\.0\.0\.1:3765|Failed to load resource/i.test(e)
  );
  pass('no-console-errors', materialErrors.length === 0, materialErrors.slice(0, 3).join('; '));
  pass('xss-inert', !chgBody.includes('<script>'));

  await browser.close();
  console.log(JSON.stringify(R, null, 2));
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  if (failed.length) {
    console.error('AI 5B browser failures:', failed);
    process.exit(1);
  }
  console.log('AI 5B browser acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
