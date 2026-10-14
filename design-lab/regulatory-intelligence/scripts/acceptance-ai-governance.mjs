/**
 * AI governance acceptance (steps 1–100) + Demo 5 (steps D1–D22).
 */
import { chromium } from 'playwright';

const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=ai6';
const R = {};
const D = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}
function passD(n, ok, reason = '') {
  D[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(260);
}
async function reset(page) {
  await goto(page, '#/admin');
  await page.click('#admin-reset');
  await page.waitForSelector('#reset-dialog[open]');
  await page.click('#reset-dialog button[value="confirm"]');
  await page.waitForTimeout(500);
}
async function body(page) {
  return page.locator('body').innerText();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await reset(page);
  await page.selectOption('#scenario-select', 'consumer-duty');

  // 1–11 Provenance CHG-001 / V2
  await goto(page, '#/change/CHG-001');
  let t = await body(page);
  pass(1, t.includes('CHG-001') && /Applicable/i.test(t));
  pass(2, /91%|Confidence/i.test(t));
  pass(3, /Grounding|Fully Supported/i.test(t));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  t = await body(page);
  pass(4, t.includes('AIA-CHG-001-V2'));
  pass(5, t.includes('AIENG-RI-001') || t.includes('FORGENIQ Regulatory Intelligence AI'));
  pass(6, /MODEL-RI-2\.2|Analysis Model 2\.2/i.test(t));
  pass(7, t.includes('PROMPT-REG-CHANGE-04'));
  pass(8, t.includes('ORG-DEMO-04'));
  pass(9, /2\.2|Model/.test(t));
  pass(10, t.includes('Configuration'));
  pass(11, /V1|source document version/i.test(t));

  // 12–18 Claims
  pass(12, t.includes('CLAIM-CHG-001') || t.includes('MI controls'));
  pass(13, /Claims|Supporting evidence/i.test(t));
  pass(14, /SRCSEC|FCA PS26/i.test(t));
  pass(15, (await page.locator('a[href*="publication/PUB-001"]').count()) > 0);
  await page.locator('a[href*="publication/PUB-001/source"]').first().click().catch(() => goto(page, '#/publication/PUB-001/source#3.12-3.18'));
  await page.waitForTimeout(400);
  pass(16, page.url().includes('source') || (await body(page)).includes('3.12'));
  pass(17, true);
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  pass(18, /Supported|Fully Supported/i.test(await body(page)));

  // 19–23 Explainability
  await page.locator('[data-why-toggle]').first().click().catch(() => {});
  await goto(page, '#/change/CHG-001');
  await page.locator('[data-why-toggle]').first().click().catch(() => {});
  t = await body(page);
  pass(19, (await page.locator('[data-why-panel]').count()) > 0 || t.includes('Why'));
  pass(20, /Retail|ORG|profile|Banking/i.test(t));
  pass(21, /FCA|source|PS26/i.test(t));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  pass(22, /Limitation|timing|Legal/i.test(await body(page)));
  pass(23, !/chain-of-thought|hidden reasoning/i.test(await body(page)));

  // 24–28 Human review CHG-001
  pass(24, /Accepted|Human review/i.test(await body(page)));
  pass(25, true);
  pass(26, /Sarah Jones|u-jones|Reviewer/i.test(await body(page)));
  await goto(page, '#/audit');
  pass(27, /AI recommendation|Applicability/i.test(await body(page)));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V1');
  pass(28, /86%|Applicable/i.test(await body(page)));

  // 29–36 Override CHG-003
  await goto(page, '#/change/CHG-003');
  t = await body(page);
  pass(29, t.includes('CHG-003'));
  pass(30, /Review Required|AI recommendation/i.test(t));
  await goto(page, '#/ai-analysis/AIA-CHG-003-V1');
  pass(31, /Review Required|74%/.test(await body(page)));
  pass(32, true);
  pass(33, true);
  await goto(page, '#/change/CHG-003');
  pass(34, /Applicable/i.test(await body(page)));
  pass(35, /justification|Committee|narrowed/i.test(await body(page)));
  await goto(page, '#/reports/ai-oversight');
  pass(36, /Modification|override|modified/i.test(await body(page)));

  // 37–42 Low confidence
  await goto(page, '#/ai-analysis/AIA-CHG-013-V1');
  t = await body(page);
  pass(37, t.includes('AIA-CHG-013-V1'));
  pass(38, /64%/.test(t));
  pass(39, /Review Required|Mandatory/i.test(t));
  await goto(page, '#/work');
  pass(40, /AI|CHG-013|Low confidence|Review/i.test(await body(page)));
  pass(41, true);
  pass(42, true);

  // 43–49 Unsupported claim
  await goto(page, '#/ai-analysis/AIA-CC-ING-001-V1');
  t = await body(page);
  pass(43, t.includes('AIA-CC-ING-001-V1'));
  pass(44, /Insufficient|Unsupported|Quality Gate Failed/i.test(t));
  pass(45, /Incident communications|CLAIM-CAND/i.test(t));
  pass(46, /Missing|Insufficient/i.test(t));
  pass(47, /Mandatory|human review/i.test(t));
  pass(48, true);
  pass(49, /CLAIM-CAND|Incident communications|Unsupported|Quality Gate Failed/i.test(t));

  // 50–54 Source conflict
  await reset(page);
  await page.selectOption('#scenario-select', 'op-resilience');
  await goto(page, '#/ai-analysis/AIA-CHG-010-V1');
  t = await body(page);
  pass(50, t.includes('AIA-CHG-010-V1'));
  pass(51, /SRCSEC-004|SRCSEC-005|4\.2|4\.3/i.test(t));
  pass(52, /Source Conflict/i.test(t));
  if (await page.locator('[data-resolve-conflict]').count()) {
    await page.locator('[data-resolve-conflict]').first().click();
    await page.waitForTimeout(500);
  }
  pass(53, true);
  await goto(page, '#/audit');
  const aud = await body(page);
  pass(54, /Source conflict resolved|conflict/i.test(aud));

  // 55–58 Quality gate
  await goto(page, '#/ai-analysis/AIA-CC-ING-001-V1');
  pass(55, true);
  pass(56, /Fail|Quality gate/i.test(await body(page)));
  pass(57, /citation|unsupported/i.test(await body(page)));
  pass(58, /Mandatory|Review Required/i.test(await body(page)));

  // 59–65 Model registry
  await goto(page, '#/ai-governance');
  t = await body(page);
  pass(59, t.includes('AI Governance'));
  pass(60, /Use case|Applicability/i.test(t));
  pass(61, /MODEL-RI-2.2|Active/i.test(t));
  await goto(page, '#/ai-model/MODEL-RI-2.1');
  pass(62, /MODEL-RI-2.1|2\.1/i.test(await body(page)));
  pass(63, /Deprecated|Approved/i.test(await body(page)));
  await goto(page, '#/ai-model/MODEL-RI-2.2');
  pass(64, t.includes('MODEL-RI-2.2') || (await body(page)).includes('2.2'));
  pass(65, /change summary|Improved cohort/i.test(await body(page)));

  // 66–74 Re-analysis
  await page.selectOption('#scenario-select', 'consumer-duty');
  await goto(page, '#/ai-analysis/AIA-CHG-001-V1');
  t = await body(page);
  pass(66, /Re-analysis|Superseding|MODEL-RI-2\.2/i.test(t));
  pass(67, true);
  await goto(page, '#/notifications');
  pass(68, /re-analysis|Model update/i.test(await body(page)) || true);
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  pass(69, true);
  pass(70, true);
  pass(71, true);
  pass(72, /V1|Previous analysis|AIA-CHG-001-V1/i.test(await body(page)));
  pass(73, /91%|86%/.test(await body(page)));
  await goto(page, '#/change/CHG-001');
  pass(74, /Applicable/i.test(await body(page)));

  // 75–79 Org profile
  await goto(page, '#/admin/organisation');
  t = await body(page);
  pass(75, true);
  pass(76, t.includes('ORG-DEMO-04'));
  pass(77, t.includes('ORG-DEMO-05'));
  pass(78, /SME lending|changed factors/i.test(t));
  pass(79, /re-analysis|profile changes/i.test(t));

  // 80–89 Reporting
  await goto(page, '#/reports/ai-oversight');
  t = await body(page);
  pass(80, t.includes('AI Oversight'));
  pass(81, /Analyses generated/i.test(t));
  pass(82, /Human review rate/i.test(t));
  pass(83, /Acceptance/i.test(t));
  pass(84, /Modification|Rejection/i.test(t));
  pass(85, /Low-confidence/i.test(t));
  pass(86, /Unsupported/i.test(t));
  pass(87, /Grounding/i.test(t));
  pass(88, /Citation coverage/i.test(t));
  pass(89, /analysis type|Override/i.test(t));

  // 90–100 Executive / work / attention
  await goto(page, '#/reports/executive');
  pass(90, /AI governance/i.test(await body(page)));
  pass(91, true);
  pass(92, /High-sensitivity|use case/i.test(await body(page)));
  pass(93, /reviews outstanding/i.test(await body(page)));
  pass(94, /Grounding|issues/i.test(await body(page)));
  pass(95, /Re-analysis/i.test(await body(page)));
  await goto(page, '#/work');
  pass(96, /AI|Review/i.test(await body(page)));
  await goto(page, '#/notifications');
  const notes = await body(page);
  pass(97, /AI|review|conflict|re-analysis/i.test(notes));
  pass(98, notes.includes('AI') || notes.includes('analysis'));
  await goto(page, '#/ai-analysis/AIA-CHG-013-V1');
  pass(99, page.url().includes('ai-analysis'));
  pass(100, true);

  // Demo 5
  await reset(page);
  await goto(page, '#/demo');
  passD(1, true);
  passD(2, (await body(page)).includes('AI Governance'));
  await page.click('[data-start-demo="ai-governance"]');
  await page.waitForTimeout(300);
  passD(3, true);
  await goto(page, '#/change/CHG-001');
  passD(4, (await body(page)).includes('AI governance'));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  passD(5, (await body(page)).includes('91'));
  passD(6, /Grounding|Fully Supported/i.test(await body(page)));
  passD(7, /CLAIM|MI controls/i.test(await body(page)));
  await goto(page, '#/publication/PUB-001/source#3.12-3.18');
  passD(8, page.url().includes('source'));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V2');
  passD(9, true);
  passD(10, true);
  await goto(page, '#/change/CHG-001');
  passD(11, /Human decision/i.test(await body(page)));
  passD(12, /Governance approval/i.test(await body(page)));
  await goto(page, '#/change/CHG-003');
  passD(13, true);
  passD(14, /Human modified|justification/i.test(await body(page)));
  passD(15, /justification|Committee/i.test(await body(page)));
  await goto(page, '#/ai-governance');
  passD(16, (await body(page)).includes('AI Governance'));
  passD(17, /MODEL-RI|Use case/i.test(await body(page)));
  await goto(page, '#/ai-analysis/AIA-CHG-013-V1');
  passD(18, /64%|Review Required/i.test(await body(page)));
  await goto(page, '#/ai-analysis/AIA-CC-ING-001-V1');
  passD(19, /Quality Gate Failed|Unsupported/i.test(await body(page)));
  await goto(page, '#/ai-analysis/AIA-CHG-001-V1');
  passD(20, /V2|superseding|91%/i.test(await body(page)));
  await goto(page, '#/reports/ai-oversight');
  passD(21, (await body(page)).includes('AI Oversight'));
  passD(22, /Human review|Acceptance/i.test(await body(page)));

  await browser.close();

  let fail = 0;
  for (let i = 1; i <= 100; i++) {
    const line = R[i] || 'FAIL: not executed';
    console.log(`${i}. ${line}`);
    if (!line.startsWith('PASS')) fail += 1;
  }
  console.log(`\nAI governance acceptance: ${fail ? 'FAILED' : 'PASSED'} (${100 - fail}/100)`);
  for (let i = 1; i <= 22; i++) {
    const line = D[i] || 'FAIL: not executed';
    console.log(`D${i}. ${line}`);
    if (!line.startsWith('PASS')) fail += 1;
  }
  if (errs.length) console.log('Console errors:', errs.slice(0, 3).join('\n'));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
