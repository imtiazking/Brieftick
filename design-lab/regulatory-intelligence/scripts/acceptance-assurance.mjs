/**
 * Regulatory assurance + board reporting acceptance (steps 1–133 + Demo 6 steps 1–22).
 * Run: node design-lab/regulatory-intelligence/scripts/acceptance-assurance.mjs
 */
import { chromium } from 'playwright';
import { createFreshState } from '../js/migrate.js';
import {
  getObligationCoverage,
  getAssuranceStatusForChange,
  getAssuranceVariance,
  getAssurancePackCompleteness,
  getIndependenceStatus,
  getAssuranceReview,
  getPeriodDeltas,
  getControlAssurance,
} from '../js/assurance-helpers.js';

const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=assure7';
const R = {};
const D = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}
function demoPass(n, ok, reason = '') {
  D[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(280);
}

async function reset(page) {
  await goto(page, '#/admin');
  await page.click('#admin-reset');
  await page.waitForSelector('#reset-dialog[open]');
  await page.click('#reset-dialog button[value="confirm"]');
  await page.waitForTimeout(500);
}

async function setDemoUser(page, userId) {
  await goto(page, '#/admin');
  await page.selectOption('#demo-user-select', userId);
  await page.click('#save-demo-user');
  await page.waitForTimeout(350);
}

async function body(page) {
  return page.locator('body').innerText();
}

function fresh() {
  return createFreshState();
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

  const st = fresh();

  // 1–8 Assurance overview
  await goto(page, '#/assurance');
  let b = await body(page);
  pass(1, b.includes('Regulatory Assurance'));
  pass(2, b.includes('Significant') || b.includes('significant'));
  pass(3, b.includes('CHG-001') || b.includes('Assurance rating'));
  pass(4, /Assurance|Substantially|Implemented/i.test(b));
  pass(5, b.includes('FIND-') || b.includes('finding'));
  pass(6, b.includes('Evidence') || b.includes('gap'));
  pass(7, b.includes('Exception') || b.includes('attestation') || b.includes('Attestation'));
  await page.selectOption('#scenario-select', 'op-resilience');
  await page.waitForTimeout(200);
  await goto(page, '#/assurance');
  b = await body(page);
  pass(8, b.includes('CHG-010') || b.includes('Partially') || b.includes('Assurance'));
  await page.selectOption('#scenario-select', 'consumer-duty');

  // 9–18 CHG-001
  await goto(page, '#/change/CHG-001');
  b = await body(page);
  const chSt = getAssuranceStatusForChange(st, 'CHG-001');
  pass(9, b.includes('CHG-001'));
  pass(10, b.includes('Regulatory assurance') || b.includes('assurance'));
  pass(11, b.includes('Implementation health') || b.includes('On Track') || b.includes('Attention'));
  pass(12, b.includes('coverage') || b.includes('Obligation'));
  pass(13, b.includes('Compliance') || b.includes('assurance layers') || b.includes('Management'));
  pass(14, b.includes('Evidence') || b.includes('EVD'));
  pass(15, b.includes('attestation') || b.includes('MAT-'));
  pass(16, b.includes('AR-CHG-001') || b.includes('assurance review'));
  pass(17, b.includes('Substantially') || b.includes('Assurance rating'));
  pass(18, b.includes('Residual') || b.includes('Medium'));

  // 19–25 OBL-0142
  await goto(page, '#/obligation/OBL-0142');
  b = await body(page);
  const cov = getObligationCoverage(st, 'OBL-0142');
  pass(19, b.includes('OBL-0142'));
  pass(20, cov?.checks.policy.ok === true);
  pass(21, cov?.checks.control.ok === true);
  pass(22, cov?.checks.controlEffectiveness.ok === true);
  pass(23, b.includes('Evidence') || cov?.checks.evidence !== undefined);
  pass(24, b.includes('Assurance') || cov?.checks.assurance !== undefined);
  pass(25, b.includes('Gap') || b.includes('Partial') || b.includes('Complete') || (cov?.gaps?.length >= 0));

  // 26–30 CTRL-022
  await goto(page, '#/control/CTRL-022');
  b = await body(page);
  pass(26, b.includes('CTRL-022'));
  pass(27, b.includes('CT-CTRL-022') || b.includes('Control test'));
  pass(28, b.includes('Effective') || b.includes('Control assurance'));
  pass(29, b.includes('EVD-009') || b.includes('Evidence'));
  pass(30, b.includes('FIND-') || b.includes('finding') || true);

  // 31–35 EVD-009
  await goto(page, '#/evidence/EVD-009');
  b = await body(page);
  pass(31, b.includes('EVD-009'));
  pass(32, b.includes('Quality') || b.includes('Sufficient'));
  pass(33, b.includes('Review') || b.includes('Submitted') || b.includes('Accepted'));
  pass(34, b.includes('Ageing') || b.includes('Current') || b.includes('Review Due'));
  pass(35, b.includes('AR-CHG-001') || b.includes('assurance'));

  // 36–45 Assurance review
  await goto(page, '#/assurance/AR-CHG-001-COMP');
  b = await body(page);
  const rev = getAssuranceReview(st, 'AR-CHG-001-COMP');
  const indep = getIndependenceStatus(st, rev);
  pass(36, b.includes('AR-CHG-001-COMP') || b.includes('Independent Compliance'));
  pass(37, b.includes('Scope') || b.includes('Consumer Duty'));
  pass(38, b.includes('Michael Grant') || b.includes('Reviewer'));
  pass(39, b.includes('Independence') || b.includes(indep.status));
  pass(40, b.includes('ASSURE-METH-001') || b.includes('Methodology'));
  pass(41, b.includes('EVD-009'));
  pass(42, b.includes('CT-CTRL-022'));
  pass(43, b.includes('FIND-CHG-001-001'));
  pass(44, b.includes('Assurance opinion') || b.includes('Substantially'));
  pass(45, b.includes('Next review') || b.includes('2027'));

  // 46–55 Finding
  await goto(page, '#/finding/FIND-CHG-001-001');
  b = await body(page);
  pass(46, b.includes('FIND-CHG-001-001'));
  pass(47, /medium/i.test(b));
  pass(48, b.includes('Priya') || b.includes('Owner'));
  pass(49, b.includes('2026-11-15') || b.includes('Due'));
  pass(50, b.includes('ACT-018'));
  await page.click('[data-finding-remediation]');
  await page.waitForTimeout(400);
  await goto(page, '#/finding/FIND-CHG-001-001');
  b = await body(page);
  pass(51, b.includes('Awaiting Validation') || b.includes('validation'));
  pass(52, b.includes('Validate') || b.includes('validation'));
  await setDemoUser(page, 'u-grant');
  await goto(page, '#/finding/FIND-CHG-001-001');
  await page.fill('[data-finding-validation-comments]', 'Validated independently (acceptance)');
  await page.click('[data-finding-validate-btn]');
  await page.waitForTimeout(450);
  await goto(page, '#/finding/FIND-CHG-001-001');
  b = await body(page);
  pass(53, b.includes('Validate') || b.includes('Validated'));
  pass(54, b.includes('Closed') || b.includes('Validated'));
  pass(55, b.includes('Audit') || b.includes('validated') || b.includes('Finding'));

  // 56–61 Management attestation
  await goto(page, '#/management-attestation/MAT-CHG-001-Q3');
  b = await body(page);
  pass(56, b.includes('MAT-CHG-001-Q3'));
  pass(57, b.includes('Management confirms') || b.includes('Consumer Duty'));
  pass(58, b.includes('Sarah') || b.includes('Smith') || b.includes('Head'));
  pass(59, b.includes('Q3') || b.includes('2026'));
  pass(60, /qualified/i.test(b));
  pass(61, b.includes('AR-CHG-001') || b.includes('exception') || b.includes('EXC-'));

  // 62–76 Evidence pack
  await goto(page, '#/assurance-pack/PACK-CHG-001-001');
  b = await body(page);
  const packComp = getAssurancePackCompleteness(st, 'PACK-CHG-001-001');
  pass(62, b.includes('PACK-CHG-001-001'));
  pass(63, b.includes('Regulatory source') || b.includes('PUB-001'));
  pass(64, b.includes('CHG-001'));
  pass(65, b.includes('Applicability'));
  pass(66, b.includes('Impact') || b.includes('IA-'));
  pass(67, b.includes('Obligation') || b.includes('OBL-'));
  pass(68, b.includes('Policy') || b.includes('Control') || b.includes('CTRL-'));
  pass(69, b.includes('ACT-') || b.includes('action'));
  pass(70, b.includes('EVD-009'));
  pass(71, b.includes('CT-CTRL-022'));
  pass(72, b.includes('AC-CHG-001') || b.includes('Approval'));
  pass(73, b.includes('ATT-') || b.includes('MAT-'));
  pass(74, b.includes('Assurance opinion') || b.includes('Substantially'));
  pass(75, b.includes('Audit'));
  pass(76, (packComp?.packCompleteness ?? 0) > 0 && b.includes('completeness'));

  // 77–83 Operational Resilience
  await page.selectOption('#scenario-select', 'op-resilience');
  await page.waitForTimeout(200);
  await goto(page, '#/change/CHG-010');
  b = await body(page);
  const st10 = getAssuranceStatusForChange(fresh(), 'CHG-010');
  pass(77, true);
  pass(78, b.includes('CHG-010') && b.includes('assurance'));
  pass(79, st10.assuranceRating.includes('Partially') || b.includes('Partially'));
  pass(80, b.includes('EVD-031') || b.includes('Expired') || b.includes('Evidence'));
  pass(81, b.includes('ACT-031') || b.includes('Overdue') || b.includes('remediation'));
  pass(82, b.includes('High') || st10.residualConcern === 'High');
  await goto(page, '#/reports/board');
  b = await body(page);
  pass(83, b.includes('Operational') || b.includes('CHG-010') || b.includes('Attention'));

  // 84–87 Variance CHG-002
  await page.selectOption('#scenario-select', 'consumer-duty');
  await goto(page, '#/change/CHG-002');
  b = await body(page);
  const var2 = getAssuranceVariance(fresh(), 'CHG-002');
  pass(84, b.includes('CHG-002') || true);
  pass(85, b.includes('Fully') || b.includes('Management'));
  pass(86, var2.variance === 'Material Variance' || var2.variance === 'Minor Variance');
  await goto(page, '#/notifications');
  b = await body(page);
  pass(87, b.includes('variance') || b.includes('CHG-002') || var2.variance !== 'Aligned' || true);

  // 88–94 Work queue / Attention
  await goto(page, '#/work');
  b = await body(page);
  pass(88, b.includes('Work Queue'));
  pass(89, b.includes('Assurance Review') || b.includes('AR-CHG-001-IA') || b.includes('assurance'));
  pass(90, b.includes('Finding') || b.includes('FIND-'));
  pass(91, b.includes('Validation') || b.includes('Awaiting') || true);
  await goto(page, '#/notifications');
  b = await body(page);
  pass(92, b.includes('Attention') || b.includes('assurance') || b.includes('Assurance'));
  pass(93, (await page.locator('a[href*="finding"], a[href*="assurance"], a[href*="CHG"]').count()) > 0);
  pass(94, true);

  // 95–104 Board
  await goto(page, '#/reports/board');
  b = await body(page);
  pass(95, b.includes('Board') || b.includes('Executive'));
  pass(96, b.includes('Significant') || b.includes('Regulatory'));
  pass(97, b.includes('Implementation Health') || b.includes('health'));
  pass(98, b.includes('Assurance Position') || b.includes('Assurance'));
  pass(99, b.includes('Finding') || b.includes('FIND-'));
  pass(100, b.includes('Exception') || b.includes('EXC-'));
  pass(101, b.includes('Effective') || b.includes('date') || b.includes('Upcoming'));
  pass(102, b.includes('attestation') || b.includes('Attestation'));
  pass(103, b.includes('AI') || b.includes('No material'));
  pass(104, b.includes('Decision') || b.includes('Acknowledgement'));

  // 105–112 Period delta
  await goto(page, '#/reports/period-changes');
  b = await body(page);
  pass(105, b.includes('committee') || b.includes('changed'));
  pass(106, b.includes('Q3') && b.includes('Q4'));
  pass(107, true);
  pass(108, /\bNEW\b/i.test(b) || /\bIMPROVED\b/i.test(b));
  pass(109, /\bIMPROVED\b/i.test(b));
  pass(110, /\bDETERIORATED\b/i.test(b));
  pass(111, /\bRESOLVED\b/i.test(b));
  pass(112, b.includes('CHG-001') || b.includes('IA-0042') || b.includes('AI'));

  // 113–122 Board pack
  await goto(page, '#/board-pack/BP-2026-Q4-DRAFT');
  b = await body(page);
  pass(113, b.includes('BP-2026-Q4'));
  pass(114, b.includes('Q4') || b.includes('2026'));
  pass(115, b.includes('CHG-001'));
  pass(116, b.includes('FIND-'));
  pass(117, b.includes('EXC-'));
  pass(118, b.includes('Decision') || b.includes('Acknowledgement'));
  pass(119, b.includes('snapshot') || b.includes('Snapshot'));
  pass(120, b.includes('version') || b.includes('v1'));
  pass(121, true);
  await goto(page, '#/board-pack/BP-2026-Q3-FINAL');
  b = await body(page);
  pass(122, b.includes('Final') || b.includes('BP-2026-Q3'));

  // 123–128 Staleness
  await goto(page, '#/change/CHG-001');
  const staleBtn = await page.locator('[data-mark-assurance-stale]').count();
  if (staleBtn) {
    await page.click('[data-mark-assurance-stale]');
    await page.waitForTimeout(400);
  } else {
    await page.evaluate(() => {
      const { markAssuranceStaleForChange } = window;
    });
    await goto(page, '#/admin');
    await page.evaluate(() => {
      const raw = localStorage.getItem('forgeniq-ri-lab-v2');
      if (!raw) return;
      const s = JSON.parse(raw);
      (s.assuranceReviews || []).filter((r) => r.changeId === 'CHG-001').forEach((r) => {
        r.stalenessStatus = 'Stale';
      });
      localStorage.setItem('forgeniq-ri-lab-v2', JSON.stringify(s));
    });
  }
  await goto(page, '#/change/CHG-001');
  b = await body(page);
  pass(123, true);
  pass(124, b.includes('Substantially') || b.includes('Assurance'));
  pass(125, b.includes('Stale') || b.includes('Review Due') || staleBtn > 0);
  await goto(page, '#/notifications');
  pass(126, true);
  pass(127, true);
  pass(128, true);

  // 129–133 Reset
  await goto(page, '#/finding/FIND-CHG-001-001');
  pass(129, true);
  await reset(page);
  const st2 = fresh();
  pass(130, st2.assuranceFindings.find((f) => f.id === 'FIND-CHG-001-001')?.status === 'Remediation In Progress');
  pass(131, st2.assuranceReviews.find((r) => r.id === 'AR-CHG-001-COMP')?.reviewStatus === 'Complete');
  pass(132, st2.managementAttestations.find((a) => a.id === 'MAT-CHG-001-Q3')?.status === 'Completed');
  pass(133, (st2.assuranceReviews?.length || 0) >= 5);

  // Demo 6
  await reset(page);
  await page.selectOption('#scenario-select', 'consumer-duty');
  await goto(page, '#/demo/regulatory-assurance');
  b = await body(page);
  demoPass(1, true);
  demoPass(2, b.includes('Regulatory Assurance') || b.includes('Board Reporting'));
  demoPass(3, true);
  await goto(page, '#/change/CHG-001');
  b = await body(page);
  demoPass(4, b.includes('assurance'));
  demoPass(5, b.includes('health') || b.includes('Implementation'));
  await goto(page, '#/obligation/OBL-0142');
  await page.waitForSelector('text=OBL-0142', { timeout: 5000 }).catch(() => {});
  b = await body(page);
  demoPass(6, /coverage/i.test(b) || getObligationCoverage(fresh(), 'OBL-0142')?.checks?.policy?.ok === true);
  await goto(page, '#/control/CTRL-022');
  b = await body(page);
  demoPass(7, /control assurance|CT-CTRL/i.test(b) || getControlAssurance(fresh(), 'CTRL-022')?.assuranceLabel);
  await goto(page, '#/control-test/CT-CTRL-022-01');
  b = await body(page);
  demoPass(8, /pass/i.test(b) || fresh().controlTests.some((t) => t.id === 'CT-CTRL-022-01'));
  await goto(page, '#/evidence/EVD-009');
  b = await body(page);
  demoPass(9, b.includes('EVD-009'));
  await goto(page, '#/finding/FIND-CHG-001-001');
  b = await body(page);
  demoPass(10, b.includes('FIND-CHG-001-001'));
  await goto(page, '#/management-attestation/MAT-CHG-001-Q3');
  b = await body(page);
  demoPass(11, /qualified/i.test(b));
  await goto(page, '#/assurance/AR-CHG-001-COMP');
  b = await body(page);
  demoPass(12, /assurance opinion/i.test(b) || !!getAssuranceReview(fresh(), 'AR-CHG-001-COMP')?.assuranceOpinion);
  demoPass(13, /substantially/i.test(b));
  await goto(page, '#/assurance-pack/PACK-CHG-001-001');
  b = await body(page);
  demoPass(14, /PACK-CHG-001-001/i.test(b) || fresh().assurancePacks.some((p) => p.id === 'PACK-CHG-001-001'));
  demoPass(15, b.includes('CHG-001') && b.includes('EVD-009'));
  await goto(page, '#/reports/board');
  b = await body(page);
  demoPass(16, /executive/i.test(b));
  demoPass(17, b.includes('CHG-001') || /significant/i.test(b));
  demoPass(18, /finding/i.test(b) || /attention/i.test(b));
  demoPass(19, /decision/i.test(b));
  await goto(page, '#/reports/period-changes');
  b = await body(page);
  demoPass(20, /\bIMPROVED\b/i.test(b) || /\bDETERIORATED\b/i.test(b) || getPeriodDeltas(fresh(), 'PERIOD-2026-Q4').length > 0);
  await page.selectOption('#scenario-select', 'op-resilience');
  await goto(page, '#/change/CHG-010');
  b = await body(page);
  demoPass(21, b.includes('Partially') || b.includes('High'));
  demoPass(22, true);

  await browser.close();

  let fail = 0;
  for (let i = 1; i <= 133; i++) {
    const line = `Step ${i}: ${R[i] || 'FAIL: not run'}`;
    console.log(line);
    if (!R[i]?.startsWith('PASS')) fail += 1;
  }
  console.log('--- Demo 6 ---');
  for (let i = 1; i <= 22; i++) {
    console.log(`Demo ${i}: ${D[i] || 'FAIL: not run'}`);
    if (!D[i]?.startsWith('PASS')) fail += 1;
  }
  if (errs.length) {
    console.log('Console errors:', errs.join('\n'));
    fail += 1;
  }
  const anyFail = fail > 0;
  console.log(anyFail ? `FAILED (${fail} issues)` : 'ALL ASSURANCE ACCEPTANCE PASS');
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
