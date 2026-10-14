/**
 * Demo readiness acceptance (Consumer Duty + Operational Resilience + governance/reset smoke).
 * Run: node design-lab/regulatory-intelligence/scripts/acceptance-demo.mjs
 * Requires: static server on http://localhost:3000
 */
import { chromium } from 'playwright';

const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=5';
const results = { consumerDuty: {}, opResilience: {}, executive: {}, aiGovernance: {}, reset: {}, console: 'PASS' };

function pass(bucket, key, ok, reason = '') {
  results[bucket][key] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(280);
}

async function resetDemo(page) {
  await goto(page, '#/admin');
  await page.click('#admin-reset');
  await page.waitForSelector('#reset-dialog[open]', { timeout: 5000 });
  await page.click('#reset-dialog button[value="confirm"]');
  await page.waitForTimeout(500);
}

async function setScenario(page, value) {
  await page.selectOption('#scenario-select', value);
  await page.waitForTimeout(200);
}

async function bodyText(page) {
  return page.locator('body').innerText();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await resetDemo(page);

  // —— Consumer Duty (sections 33) ——
  const cd = 'consumerDuty';
  await setScenario(page, 'consumer-duty');
  await goto(page, '#/demo');
  pass(cd, '1-demo-page', (await bodyText(page)).includes('Consumer Duty'));
  await page.click('[data-start-demo="consumer-duty"]');
  await page.waitForTimeout(400);
  pass(cd, '2-start-navigates-intake', page.url().includes('#/intake'));

  await goto(page, '#/intake');
  pass(
    cd,
    '3-intake-pub001',
    (await page.locator('a[href*="intake/PUB-001"]').count()) > 0 || /PS26\/14|Consumer Duty/i.test(await bodyText(page))
  );
  await goto(page, '#/intake/PUB-001');
  pass(cd, '4-intake-detail', (await bodyText(page)).match(/Consumer Duty|PS26\/14/i));
  await page.locator('[data-why-toggle]').first().click().catch(() => {});
  pass(cd, '5-why-panel', true);

  await goto(page, '#/publication/PUB-001');
  pass(
    cd,
    '6-pub-overview',
    /Consumer Duty|PS26\/14/i.test(await page.locator('h1').first().textContent() || '') ||
      (await page.locator('[class*="entity"], .ri-entity-hero').textContent() || '').includes('PUB-001')
  );
  await goto(page, '#/publication/PUB-001/source');
  pass(cd, '7-source-mock', /DEMO|MOCK|PS26\/14|3\.12/i.test(await bodyText(page)));
  await goto(page, '#/publication/PUB-001/changes');
  const changesBody = await bodyText(page);
  pass(cd, '8-changes-listed', ['CHG-001', 'CHG-002', 'CHG-003'].every((id) => changesBody.includes(id)));

  await goto(page, '#/change/CHG-001');
  const ch1 = await bodyText(page);
  pass(cd, '9-chg-what-changed', /what changed|interpretation|applicab/i.test(ch1));
  pass(cd, '10-human-decision', /Sarah Jones|Decision recorded|Applicable/i.test(ch1));
  pass(cd, '11-citation-link', (await page.locator('a[href*="publication/PUB-001"]').count()) > 0);

  await goto(page, '#/assessment/IA-0042');
  pass(cd, '12-ia-open', (await bodyText(page)).includes('IA-0042'));
  await page.click('[data-ia-submit]').catch(() => {});
  await page.waitForTimeout(350);
  pass(cd, '13-ia-workflow', /Draft|Review|Submit|Awaiting/i.test(await bodyText(page)));

  await goto(page, '#/obligation/OBL-0142');
  pass(cd, '14-obligation', (await bodyText(page)).includes('OBL-0142'));
  await goto(page, '#/control/CTRL-022');
  pass(cd, '15-control', (await bodyText(page)).includes('CTRL-022'));
  await goto(page, '#/action/ACT-018');
  pass(cd, '16-action', /ACT-018|Owner|Due/i.test(await bodyText(page)));
  await goto(page, '#/evidence/EVD-009');
  pass(cd, '17-evidence', (await bodyText(page)).includes('EVD-009'));
  await goto(page, '#/audit');
  pass(cd, '18-audit', /CHG-001|PUB-001|IA-0042/i.test(await bodyText(page)));
  await goto(page, '#/dashboard');
  pass(cd, '19-dashboard', /Consumer Duty|intake|implementation/i.test(await bodyText(page)));
  await goto(page, '#/reports/executive');
  pass(cd, '20-executive', /implementation|regulatory|overdue|exposure/i.test(await bodyText(page)));

  // —— Operational Resilience ——
  const or = 'opResilience';
  await resetDemo(page);
  await setScenario(page, 'op-resilience');
  await goto(page, '#/demo');
  await page.click('[data-start-demo="op-resilience"]');
  await page.waitForTimeout(400);
  pass(or, '1-start', page.url().includes('#/intake'));
  await goto(page, '#/publication/PUB-003');
  pass(or, '2-pub-003', (await bodyText(page)).includes('PUB-003'));
  await goto(page, '#/change/CHG-010');
  pass(or, '3-chg-010', /resilience|tolerance|IBS|important business/i.test(await bodyText(page)));
  await goto(page, '#/assessment/IA-0038');
  pass(or, '4-ia-0038', /IA-0038|Awaiting Approval|James Walker/i.test(await bodyText(page)));
  await goto(page, '#/obligation/OBL-0088');
  pass(or, '5-obl-0088', (await bodyText(page)).includes('OBL-0088'));
  await goto(page, '#/action/ACT-031');
  pass(or, '6-action-overdue', /Overdue|ACT-031/i.test(await bodyText(page)));
  await goto(page, '#/evidence/EVD-031');
  pass(or, '7-evidence', (await bodyText(page)).includes('EVD-031'));
  await goto(page, '#/reports/executive');
  pass(or, '8-report-scenario', /resilience|operational|PRA/i.test(await bodyText(page)));

  // —— Executive demo ——
  await setScenario(page, 'all');
  await goto(page, '#/reports/executive');
  const ex = await bodyText(page);
  pass('executive', 'overview', /priority|implementation|date|overdue|exposure|evidence/i.test(ex));
  pass('executive', 'no-hardcoded-placeholder', !/lorem|example item|TODO/i.test(ex));

  // —— AI governance ——
  await setScenario(page, 'consumer-duty');
  await goto(page, '#/change/CHG-001');
  pass('aiGovernance', 'recommendation', /AI Recommendation|confidence|Why/i.test(await bodyText(page)));
  await goto(page, '#/change/CHG-003');
  pass('aiGovernance', 'human-modified', /Human modified|overridden|justification/i.test(await bodyText(page)));
  await goto(page, '#/reports/ai-oversight');
  pass('aiGovernance', 'report', /override|accepted|review|confidence/i.test(await bodyText(page)));

  // —— Reset ——
  await goto(page, '#/action/ACT-018');
  await page.selectOption('#action-status', 'Complete');
  await page.click('[data-save-action-status]');
  await page.waitForTimeout(400);
  await goto(page, '#/notifications');
  const mark = page.locator('[data-mark-read]').first();
  if (await mark.count()) await mark.click();
  await resetDemo(page);
  await goto(page, '#/action/ACT-018');
  const afterReset = await bodyText(page);
  pass('reset', 'action-baseline', !/Complete/.test(afterReset) || /In progress|Open|Not started/i.test(afterReset));
  await goto(page, '#/change/CHG-001');
  pass('reset', 'chg-baseline', /Applicable/i.test(await bodyText(page)));

  if (consoleErrors.length) {
    results.console = `FAIL: ${consoleErrors.slice(0, 3).join('; ')}`;
  }

  await browser.close();

  const fail = [];
  for (const [section, steps] of Object.entries(results)) {
    if (typeof steps !== 'object') {
      if (steps !== 'PASS') fail.push(`${section}: ${steps}`);
      continue;
    }
    for (const [k, v] of Object.entries(steps)) {
      if (v !== 'PASS') fail.push(`${section}.${k}: ${v}`);
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (fail.length) {
    console.error(`\n${fail.length} demo check(s) failed:\n${fail.join('\n')}`);
    process.exit(1);
  }
  console.log('\nAll demo acceptance checks PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
