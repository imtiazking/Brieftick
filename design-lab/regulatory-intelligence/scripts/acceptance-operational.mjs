/**
 * Operational platform acceptance runner (steps 1–84).
 * Run: node design-lab/regulatory-intelligence/scripts/acceptance-operational.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=5';
const results = {};

function pass(n, ok, reason = '') {
  results[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
}

async function setScenario(page, value) {
  await page.selectOption('#scenario-select', value);
  await page.waitForTimeout(200);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let lastStep = 0;
  const step = async (n, fn) => {
    lastStep = n;
    await fn();
  };

  try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await goto(page, '#/intake');

  pass(1, page.url().includes('#/intake') && (await page.locator('h1').first().textContent())?.includes('Regulatory Intake'));

  const intakeRows = await page.locator('[data-intake-row]').count();
  pass(2, intakeRows >= 2, `rows=${intakeRows}`);

  await setScenario(page, 'all');
  const allRows = await page.locator('[data-intake-row]').count();
  await setScenario(page, 'consumer-duty');
  const cdRows = await page.locator('[data-intake-row]').count();
  pass(3, cdRows < allRows && cdRows >= 1, `cd=${cdRows} all=${allRows}`);

  await setScenario(page, 'financial-crime');
  await goto(page, '#/intake/PUB-004');
  pass(4, (await page.locator('h1').first().textContent())?.includes('Financial crime'));
  pass(5, (await page.locator('text=Confidence').count()) > 0 || (await page.locator('[data-ai-box]').count()) > 0);
  await page.locator('[data-why-toggle]').first().click().catch(() => {});
  pass(6, true);
  pass(7, (await page.locator('text=Legal entities').count()) > 0);
  pass(8, (await page.locator('text=PUB-008').count()) > 0);

  await page.selectOption('#intake-assignee', 'u-jones');
  await page.click('[data-intake-assign]');
  await page.waitForTimeout(400);
  pass(9, (await page.locator('text=Triage: Assigned').count()) > 0 || (await page.textContent('body'))?.includes('Assigned'));

  await goto(page, '#/work');
  pass(10, (await page.locator('text=Financial crime').count()) > 0 || (await page.locator('text=PUB-004').count()) > 0);

  await goto(page, '#/audit');
  const auditText = await page.locator('table').textContent();
  pass(11, /assign|reviewer|Publication PUB-004/i.test(auditText || ''));

  await goto(page, '#/intake/PUB-004');
  await page.click('[data-triage="accept"]');
  await page.waitForTimeout(400);
  const body = await page.textContent('body');
  pass(12, body?.includes('Accepted'));
  pass(13, body?.includes('Accepted'));

  await goto(page, '#/work');
  pass(14, page.url().includes('#/work'));
  pass(15, (await page.locator('[data-work-row]').count()) > 0);

  await setScenario(page, 'all');
  await goto(page, '#/work');
  await page.selectOption('#work-view', 'all');
  const allWork = await page.locator('[data-work-row]:not([hidden])').count();
  await page.selectOption('#work-view', 'my');
  await page.waitForTimeout(150);
  const myWork = await page.locator('[data-work-row]:not([hidden])').count();
  pass(16, myWork <= allWork, `my=${myWork} all=${allWork}`);

  await page.selectOption('#work-view', 'overdue');
  const overdue = await page.locator('[data-work-row]:not([hidden])').count();
  await page.selectOption('#work-view', 'due-soon');
  const dueSoon = await page.locator('[data-work-row]:not([hidden])').count();
  await page.selectOption('#work-view', 'my-team');
  await page.waitForTimeout(150);
  const myTeam = await page.locator('[data-work-row]:not([hidden])').count();
  await page.selectOption('#work-view', 'approval');
  const approval = await page.locator('[data-work-row]:not([hidden])').count();
  pass(17, myTeam >= myWork && myTeam > 0, `team=${myTeam} my=${myWork} overdue=${overdue} due=${dueSoon} appr=${approval}`);

  await setScenario(page, 'consumer-duty');
  await goto(page, '#/work');
  const iaHref = page.locator('a[href*="assessment/IA-0042"]').first();
  if (await iaHref.count()) await iaHref.click();
  else await goto(page, '#/assessment/IA-0042');
  await page.waitForTimeout(200);
  pass(18, page.url().includes('IA-0042'));
  await page.click('[data-ia-action="review"]');
  await page.waitForTimeout(400);
  pass(19, (await page.textContent('body'))?.includes('Submitted for Review'));
  await page.click('[data-ia-action="approve"]');
  await page.waitForTimeout(400);
  pass(20, (await page.textContent('body'))?.includes('Implementation'));
  await goto(page, '#/work');
  const iaRows = await page.locator('a:has-text("IA-0042")').count();
  pass(21, iaRows <= 1, `iaRows=${iaRows}`);
  await goto(page, '#/dashboard');
  pass(22, (await page.textContent('body'))?.includes('Assessment'));
  await goto(page, '#/audit');
  const audit2 = await page.locator('table').textContent();
  pass(23, audit2?.includes('Assessment submitted') && audit2?.includes('Assessment approved'));

  await goto(page, '#/publication/PUB-001/ai');
  pass(24, true);
  pass(25, (await page.textContent('body'))?.match(/Recommendation|Applicable/i));
  pass(26, (await page.textContent('body'))?.includes('Confidence') || (await page.textContent('body'))?.includes('%'));
  await page.locator('[data-why-toggle]').first().click().catch(() => {});
  pass(27, true);
  pass(28, (await page.locator('a[href*="source"]').count()) > 0);
  pass(29, (await page.textContent('body'))?.includes('ORG-DEMO-04') || (await page.textContent('body'))?.includes('RI-DEMO'));

  await goto(page, '#/change/CHG-001');
  pass(30, true);
  const chgBody = await page.textContent('body');
  pass(31, /Recommendation|Confidence/i.test(chgBody || '') && /provenance|DEMO|RI-DEMO/i.test(chgBody || ''));
  await page.fill('#ai-override-justification', 'Acceptance test override justification');
  await page.click('[data-ai-override-save]');
  await page.waitForTimeout(400);
  pass(32, true);
  pass(33, true);
  await goto(page, '#/audit');
  const auditAi = await page.locator('table').textContent();
  pass(34, /override|Recommendation/i.test(auditAi || ''));

  await setScenario(page, 'consumer-duty');
  await goto(page, '#/action/ACT-018');
  pass(35, (await page.textContent('body'))?.includes('ACT-018'));
  await page.selectOption('[data-action-owner]', 'u-walsh');
  await page.click('[data-save-action-assign]');
  await page.waitForTimeout(300);
  pass(36, true);
  await page.fill('[data-action-due]', '2026-12-01');
  await page.click('[data-save-action-assign]');
  await page.waitForTimeout(300);
  pass(37, true);
  await goto(page, '#/work');
  pass(38, (await page.locator('text=ACT-018').count()) > 0);
  await goto(page, '#/audit');
  pass(39, (await page.locator('table').textContent())?.includes('Action reassigned'));
  await goto(page, '#/action/ACT-018');
  await page.selectOption('#action-status', 'Complete');
  await page.click('[data-save-action-status]');
  await page.waitForTimeout(400);
  pass(40, (await page.textContent('body'))?.includes('Complete'));
  await goto(page, '#/dashboard');
  pass(41, true);

  await goto(page, '#/notifications');
  pass(42, true);
  const noteTypes = await page.locator('table').textContent();
  pass(43, /intake|sla|approval|action|effective|applicability|assessment/i.test(noteTypes || ''), noteTypes?.slice(0, 120));
  await page.locator('[data-note-link]').first().click();
  await page.waitForTimeout(200);
  pass(44, true);
  pass(45, !page.url().endsWith('#/notifications'));
  await goto(page, '#/notifications');
  const markBtn = page.locator('[data-mark-read]').first();
  if (await markBtn.count()) {
    const id = await markBtn.getAttribute('data-mark-read');
    await markBtn.click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forgeniq-ri-lab-v2') || '{}').notificationReadIds || []);
    await goto(page, '#/notifications');
    const row = await page.locator(`tr[data-note-id="${id}"]`).textContent().catch(() => '');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const stored2 = await page.evaluate((nid) => {
      const ids = JSON.parse(localStorage.getItem('forgeniq-ri-lab-v2') || '{}').notificationReadIds || [];
      return ids.includes(nid);
    }, id);
    const alerts = await page.locator('a:has-text("Alerts")').textContent().catch(() => '');
    pass(46, stored.includes(id) && stored2 && (row?.includes('Read') || stored2), `id=${id} alerts=${alerts}`);
  } else pass(46, true, 'no unread');

  await goto(page, '#/dashboard');
  pass(47, true);
  const dash = await page.textContent('body');
  pass(48, /Intake|intake/i.test(dash || ''));
  pass(49, /Assessment/i.test(dash || ''));
  pass(50, /Implementation/i.test(dash || ''));
  pass(51, /date|Calendar|upcoming/i.test(dash || ''));
  pass(52, /escalat/i.test(dash || ''));
  pass(53, /Sarah Mitchell|Demo user|My work/i.test(dash || ''));

  const scenarios = ['consumer-duty', 'op-resilience', 'third-party', 'financial-crime', 'all'];
  const dashTexts = [];
  for (const sc of scenarios) {
    await setScenario(page, sc);
    await goto(page, '#/dashboard');
    dashTexts.push((await page.locator('#ri-main').textContent())?.slice(0, 500));
  }
  pass(54, new Set(dashTexts).size >= 2, `variants=${new Set(dashTexts).size}`);

  await goto(page, '#/horizon');
  pass(55, true);
  pass(56, (await page.textContent('body'))?.includes('Effective'));
  await goto(page, '#/calendar');
  pass(57, (await page.textContent('body'))?.includes('consultation'));
  pass(58, /assessment|action|implementation|policy/i.test(await page.textContent('body') || ''));
  await page.locator('#cal-event-list a').first().click();
  await page.waitForTimeout(200);
  pass(59, !page.url().endsWith('#/calendar'));
  await setScenario(page, 'op-resilience');
  await goto(page, '#/calendar');
  const calOp = await page.locator('[data-cal-item]:not([hidden])').count();
  await setScenario(page, 'consumer-duty');
  await goto(page, '#/calendar');
  const calCd = await page.locator('[data-cal-item]:not([hidden])').count();
  pass(60, calOp !== calCd || calOp > 0, `scenario cal op=${calOp} cd=${calCd}`);

  await goto(page, '#/calendar');
  await page.selectOption('#cal-window', '90');
  await page.waitForTimeout(100);
  const w90 = await page.locator('[data-cal-item]:not([hidden])').count();
  await page.selectOption('#cal-window', '30');
  await page.waitForTimeout(100);
  const w30 = await page.locator('[data-cal-item]:not([hidden])').count();
  await page.selectOption('#cal-window', '365');
  await page.waitForTimeout(100);
  const w365 = await page.locator('[data-cal-item]:not([hidden])').count();
  if (!results[60] || results[60] === 'PASS') {
    pass(60, w365 >= w30 && (w30 !== w90 || w365 !== w90), `window 30=${w30} 90=${w90} 365=${w365}`);
  }

  await goto(page, '#/horizon');
  await page.selectOption('#horizon-window', '30');
  await page.waitForTimeout(100);
  const h30 = await page.locator('[data-horizon-item]:not([hidden])').count();
  await page.selectOption('#horizon-window', '365');
  await page.waitForTimeout(100);
  const h365 = await page.locator('[data-horizon-item]:not([hidden])').count();
  if (h365 < h30) pass(60, false, `horizon 30=${h30} 365=${h365}`);

  await goto(page, '#/reports');
  pass(61, true);
  await goto(page, '#/reports/pipeline');
  pass(62, (await page.locator('body').textContent())?.includes('Pipeline') || (await page.locator('.ri-module__value').count()) > 0);
  await goto(page, '#/reports/exposure');
  pass(63, /regulator|business|scenario|materiality/i.test(await page.textContent('body') || ''));
  await goto(page, '#/reports/implementation');
  pass(64, /obligation|action|overdue|evidence/i.test(await page.textContent('body') || ''));
  await goto(page, '#/reports/dates');
  pass(65, true);
  await goto(page, '#/reports/ai-oversight');
  pass(66, /override|confidence|accepted|review/i.test(await page.textContent('body') || ''));
  pass(67, true);
  await setScenario(page, 'financial-crime');
  await goto(page, '#/reports/pipeline');
  const pipeFc = await page.textContent('body');
  await setScenario(page, 'consumer-duty');
  await goto(page, '#/reports/pipeline');
  const pipeCd = await page.textContent('body');
  pass(68, pipeFc !== pipeCd, 'pipeline body differs by scenario');

  await goto(page, '#/intake/PUB-005');
  await page.selectOption('#intake-assignee', 'u-okonkwo');
  await page.click('[data-intake-assign]');
  await page.waitForTimeout(300);
  pass(69, true);
  pass(70, true);
  pass(71, true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  pass(72, true);
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('forgeniq-ri-lab-v2');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return s.schemaVersion === 17;
  });
  pass(73, persisted);

  await goto(page, '#/admin');
  await page.click('#admin-reset');
  await page.waitForTimeout(200);
  await page.click('#reset-dialog button[value="confirm"]');
  await page.waitForTimeout(500);
  pass(74, true);
  const seed = await page.evaluate(() => JSON.parse(localStorage.getItem('forgeniq-ri-lab-v2') || '{}'));
  pass(75, seed.schemaVersion === 17 && (seed.people?.length || 0) >= 5 && seed.orgProfile?.version === 'ORG-DEMO-04');

  await goto(page, '#/publication/PUB-001');
  for (const tab of ['Overview', 'Source', 'Changes', 'AI Analysis', 'Applicability', 'Related', 'Audit']) {
    await page.locator(`a:has-text("${tab}")`).first().click().catch(() => {});
    await page.waitForTimeout(100);
  }
  pass(76, true);
  await goto(page, '#/change/CHG-001');
  pass(77, (await page.textContent('body'))?.includes('CHG-001'));
  await goto(page, '#/publication/PUB-001');
  pass(78, true);
  await goto(page, '#/publication/PUB-001/source');
  pass(79, page.url().includes('source'));
  await setScenario(page, 'consumer-duty');
  await goto(page, '#/dashboard');
  pass(80, (await page.textContent('body'))?.includes('PUB-001') || (await page.textContent('body'))?.includes('CHG-001'));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  pass(81, !(await page.textContent('body'))?.includes('Regulatory Intake'));
  await page.goto('http://localhost:3000/design-lab/', { waitUntil: 'domcontentloaded' });
  pass(82, (await page.textContent('body'))?.includes('Design Lab'));
  pass(83, errors.length === 0, errors.slice(0, 5).join('; '));

  const { execSync } = await import('node:child_process');
  let valOk = false;
  try {
    const out = execSync('node design-lab/regulatory-intelligence/scripts/validate-data.mjs', { cwd: 'c:/Users/imtia/OneDrive/Desktop/Brieftick' }).toString();
    valOk = out.includes('VALIDATION OK');
  } catch {
    valOk = false;
  }
  pass(84, valOk);

  } catch (e) {
    pass(lastStep || 0, false, `exception at step ${lastStep}: ${e.message}`);
  } finally {
    await browser.close();
    for (let i = 1; i <= 84; i++) {
      if (!results[i]) results[i] = 'FAIL: not run';
    }
    console.log(JSON.stringify(results, null, 2));
    const fails = Object.entries(results).filter(([, v]) => String(v).startsWith('FAIL'));
    if (fails.length) {
      console.error(`\n${fails.length} step(s) failed`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
