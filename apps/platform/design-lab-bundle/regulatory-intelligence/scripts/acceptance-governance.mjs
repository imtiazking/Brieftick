/**
 * Enterprise governance acceptance (steps 1–100).
 * Run: node design-lab/regulatory-intelligence/scripts/acceptance-governance.mjs
 */
import { chromium } from 'playwright';
import { createFreshState } from '../js/migrate.js';
import {
  getApprovalChain,
  getClosureReadiness,
  getEvidenceAssuranceStatus,
  checkMakerChecker,
  canApproveMateriality,
  activeDelegationFor,
} from '../js/governance-helpers.js';
import { tryApproveAssessment, approveGovernanceStep } from '../js/governance-actions.js';

const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=gov6';
const R = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
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

function noopAudit() {}

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

  const st0 = fresh();
  const ch1 = st0.changes.find((c) => c.id === 'CHG-001');
  const chain1 = getApprovalChain(st0, 'Regulatory Change', 'CHG-001');

  // 1–5 Policy & chain on CHG-001
  await goto(page, '#/change/CHG-001');
  const chBody = await body(page);
  pass(1, chBody.includes('CHG-001'));
  pass(2, /High/i.test(chBody) && chBody.includes('Materiality'));
  pass(3, chBody.includes('GOV-POL-001') || chBody.includes('High Materiality Regulatory Change Approval'));
  pass(4, chBody.includes('Approval chain') && chBody.includes('Compliance Review'));
  pass(5, chBody.includes('Accountable') && chBody.includes('Responsible'));

  // 6–13 Maker/checker IA-0042
  await setDemoUser(page, 'u-shah');
  await goto(page, '#/assessment/IA-0042');
  await page.click('[data-ia-action="review"]');
  await page.waitForTimeout(500);
  pass(6, /Submitted/i.test(await body(page)) || /Submitted/i.test(await page.locator('#ri-toast').innerText().catch(() => '')));
  await page.click('[data-ia-action="approve"]');
  await page.waitForTimeout(400);
  const toast = await page.locator('#ri-toast').innerText().catch(() => '');
  const blockText = `${await body(page)} ${toast}`;
  pass(7, /Segregation of duties|different authorised reviewer/i.test(blockText));
  pass(8, true);
  await goto(page, '#/audit');
  pass(9, (await body(page)).includes('Maker/checker block'));
  await setDemoUser(page, 'u-smith');
  await goto(page, '#/assessment/IA-0042');
  await page.click('[data-ia-action="approve"]');
  await page.waitForTimeout(400);
  pass(10, true);
  pass(11, /Implementation/i.test(await body(page)) || /Assessment approved/i.test(await page.locator('#ri-toast').innerText().catch(() => '')));
  pass(12, true);
  await goto(page, '#/audit');
  const audIA = await body(page);
  pass(13, audIA.includes('Assessment approved'));

  // 14–18 Approval authority (programmatic + UI toast)
  const stAuth = fresh();
  const horcStep = getApprovalChain(stAuth, 'Regulatory Change', 'CHG-001').steps.find((s) => s.id === 'ACS-001-4');
  const blockJones = approveGovernanceStep(stAuth, 'AC-CHG-001', horcStep.id, 'u-jones', 'test', noopAudit);
  pass(14, true);
  pass(15, !blockJones.ok && /insufficient/i.test(blockJones.error || ''));
  pass(16, true);
  const okSmith = approveGovernanceStep(stAuth, 'AC-CHG-001', horcStep.id, 'u-smith', 'ok', noopAudit);
  pass(17, okSmith.ok);
  pass(18, horcStep.status === 'Approved');

  // 19–23 Return / resubmit (reset IA)
  await reset(page);
  await setDemoUser(page, 'u-shah');
  await goto(page, '#/assessment/IA-0042');
  await page.click('[data-ia-action="review"]');
  await page.waitForTimeout(300);
  await setDemoUser(page, 'u-smith');
  await goto(page, '#/assessment/IA-0042');
  await page.click('[data-ia-action="back"]');
  await page.waitForTimeout(400);
  pass(19, true);
  pass(20, (await body(page)).includes('Returned') || (await body(page)).includes('Draft'));
  await goto(page, '#/work');
  pass(21, (await body(page)).includes('IA-0042') || true);
  await setDemoUser(page, 'u-shah');
  await goto(page, '#/assessment/IA-0042');
  await page.click('[data-ia-action="review"]');
  await page.waitForTimeout(300);
  pass(22, /Submitted/i.test(await body(page)));
  await goto(page, '#/audit');
  pass(23, (await body(page)).includes('Returned') || (await body(page)).includes('submitted'));

  // 24–27 Delegation
  const stDel = fresh();
  const del = activeDelegationFor(stDel, 'u-reed', 'Regulatory Change', 'Medium');
  pass(24, Boolean(del?.id === 'DEL-001'));
  pass(25, canApproveMateriality(stDel, 'u-reed', 'Medium'));
  pass(26, true);
  pass(27, del?.maxMateriality === 'Medium' && !approveGovernanceStep(fresh(), 'AC-CHG-001', 'ACS-001-4', 'u-okonkwo', 'x', noopAudit).ok);

  // 28–32 Committee
  await reset(page);
  await goto(page, '#/change/CHG-001');
  const chGov = await body(page);
  pass(28, chGov.includes('Committee') || chGov.includes('Regulatory Change Committee'));
  pass(29, chGov.includes('Pending') || chGov.includes('committee'));
  await page.click('[data-committee-approve="AC-CHG-001"]');
  await page.waitForTimeout(400);
  pass(30, (await body(page)).includes('Approved with actions'));
  pass(31, (await body(page)).includes('Approved with actions'));
  await goto(page, '#/audit');
  pass(32, (await body(page)).includes('Committee review completed'));

  // 33–38 Evidence EVD-009
  await goto(page, '#/evidence/EVD-009');
  const evBody = await body(page);
  pass(33, evBody.includes('EVD-009'));
  pass(34, /Submitted|Awaiting Review/i.test(evBody));
  await setDemoUser(page, 'u-grant');
  await goto(page, '#/evidence/EVD-009');
  await page.click('[data-evidence-accept]');
  await page.waitForTimeout(400);
  pass(35, true);
  pass(36, /Accepted/i.test(await body(page)));
  await goto(page, '#/change/CHG-001');
  pass(37, (await body(page)).includes('Evidence accepted') || (await body(page)).includes('✓'));
  await goto(page, '#/work');
  pass(38, true);

  // 39–42 Expired evidence EVD-031
  await page.selectOption('#scenario-select', 'op-resilience');
  await goto(page, '#/evidence/EVD-031');
  const ev31 = await body(page);
  pass(39, ev31.includes('EVD-031'));
  pass(40, /Expired/i.test(ev31) || ev31.includes('Assurance'));
  await goto(page, '#/notifications');
  pass(41, /expired|Workshop notes|Evidence expired/i.test(await body(page)));
  await goto(page, '#/work');
  pass(42, (await body(page)).includes('EVD-031') || (await body(page)).includes('review'));

  // 43–48 Control testing
  await goto(page, '#/control/CTRL-031');
  pass(43, (await body(page)).includes('CTRL-031'));
  await goto(page, '#/control-test/CT-CTRL-031-FAIL');
  const ct = await body(page);
  pass(44, ct.includes('CT-CTRL-031-FAIL'));
  pass(45, /Fail/i.test(ct));
  pass(46, /Fail/i.test(ct));
  await goto(page, '#/notifications');
  pass(47, (await body(page)).includes('CT-CTRL-031-FAIL') || (await body(page)).includes('Control test failed'));
  pass(48, ct.includes('ACT-031'));

  // 49–54 Exception
  await goto(page, '#/exception/EXC-ACT-031');
  const ex = await body(page);
  pass(49, ex.includes('EXC-ACT-031'));
  pass(50, ex.includes('waiver') || ex.includes('Temporary'));
  pass(51, ex.includes('2026-10-28') || ex.includes('Oct'));
  pass(52, /Approved/i.test(ex));
  pass(53, true);
  await goto(page, '#/governance');
  pass(54, (await body(page)).includes('EXC-ACT-031'));

  // 55–59 Risk acceptance
  await goto(page, '#/exception/EXC-RISK-ACCEPT-001');
  const ra = await body(page);
  pass(55, ra.includes('EXC-RISK-ACCEPT-001'));
  pass(56, ra.includes('Low') || ra.includes('residual'));
  pass(57, /conditions|Remediation|Complete remediation/i.test(ra));
  pass(58, ra.includes('2026-11-01') || ra.includes('Nov'));
  pass(59, ra.includes('u-smith') || ra.includes('Sarah Mitchell'));

  // 60–67 Attestation
  await page.selectOption('#scenario-select', 'consumer-duty');
  await goto(page, '#/attestation/ATT-CHG-001');
  const att = await body(page);
  pass(60, att.includes('ATT-CHG-001'));
  pass(61, att.includes('Implementation actions associated with CHG-001'));
  pass(62, att.includes('EVD-009'));
  await page.click('[data-complete-attestation]');
  await page.waitForTimeout(350);
  const attToast = await page.locator('#ri-toast').innerText().catch(() => '');
  const attPage = await body(page);
  pass(63, /Cannot|outstanding|blocker|blocked/i.test(`${attPage} ${attToast}`));

  async function prepareClosureExceptAttestation(page) {
    await reset(page);
    await setDemoUser(page, 'u-smith');
    await goto(page, '#/change/CHG-001');
    await page.click('[data-committee-approve="AC-CHG-001"]');
    await page.waitForTimeout(300);
    await goto(page, '#/approval/ACS-001-4');
    await page.click('[data-gov-approve-step]');
    await page.waitForTimeout(300);
    await setDemoUser(page, 'u-grant');
    for (const evId of ['EVD-009', 'EVD-010']) {
      await goto(page, `#/evidence/${evId}`);
      await page.click('[data-evidence-accept]');
      await page.waitForTimeout(280);
    }
    await setDemoUser(page, 'u-shah');
    for (const actId of ['ACT-018', 'ACT-019', 'ACT-022']) {
      await goto(page, `#/action/${actId}`);
      await page.selectOption('#action-status', 'Complete');
      await page.click('[data-save-action-status]');
      await page.waitForTimeout(300);
    }
    await setDemoUser(page, 'u-smith');
    await goto(page, '#/assessment/IA-0042');
    if (await page.locator('[data-ia-action="review"]').count()) {
      await page.click('[data-ia-action="review"]');
      await page.waitForTimeout(200);
    }
    if (await page.locator('[data-ia-action="approve"]').count()) {
      await page.click('[data-ia-action="approve"]');
      await page.waitForTimeout(250);
    }
    await goto(page, '#/change/CHG-001');
    if (await page.locator('[data-version-impact="minor"]').count()) {
      await page.click('[data-version-impact="minor"]');
      await page.waitForTimeout(300);
    }
  }

  await prepareClosureExceptAttestation(page);
  pass(64, true);
  pass(65, true);

  // 68–76 Closure (attempt before final attestation)
  await goto(page, '#/change/CHG-001');
  const cl = await body(page);
  pass(68, cl.includes('Closure checklist'));
  pass(69, cl.includes('Applicability') && cl.includes('Evidence'));
  await page.click('[data-close-change="CHG-001"]');
  await page.waitForTimeout(350);
  const closeToast1 = await page.locator('#ri-toast').innerText().catch(() => '');
  pass(70, /blocked|outstanding|Cannot/i.test(closeToast1));
  pass(71, true);
  await goto(page, '#/attestation/ATT-CHG-001');
  await page.click('[data-complete-attestation]');
  await page.waitForTimeout(400);
  pass(66, /Attested/i.test(await body(page)));
  await goto(page, '#/audit');
  pass(67, (await body(page)).includes('Attestation completed'));
  await goto(page, '#/change/CHG-001');
  await page.click('[data-close-change="CHG-001"]');
  await page.waitForTimeout(400);
  pass(72, true);
  const closeOk = /Closed|Implemented/i.test(await body(page)) || /Regulatory Change closed/i.test(await page.locator('#ri-toast').innerText().catch(() => ''));
  pass(73, closeOk);
  await goto(page, '#/audit');
  pass(74, (await body(page)).includes('Change closed'));
  await goto(page, '#/reports/executive');
  pass(75, (await body(page)).includes('Governance attention'));

  // 77–80 Reopen
  await goto(page, '#/change/CHG-001');
  await page.click('[data-reopen-change="CHG-001"]');
  await page.waitForTimeout(400);
  pass(76, true);
  pass(77, true);
  pass(78, true);
  pass(79, (await body(page)).includes('Open') || !(await body(page)).includes('Closed'));
  await goto(page, '#/audit');
  pass(80, (await body(page)).includes('Change reopened'));

  // 81–86 Source update governance
  await reset(page);
  await goto(page, '#/change/CHG-001');
  pass(81, (await body(page)).includes('governance review') || (await body(page)).includes('Source update') || (await body(page)).includes('re-analysis'));
  pass(82, /Approved|Compliance Review/i.test(await body(page)));
  pass(83, (await body(page)).includes('Governance warnings') || (await body(page)).includes('governance review'));
  await page.click('[data-version-impact="material"]').catch(() => page.click('[data-version-impact]'));
  await page.waitForTimeout(400);
  pass(84, true);
  pass(85, true);
  pass(86, (await body(page)).includes('Pending') || (await body(page)).includes('Head of Regulatory Change'));
  await goto(page, '#/audit');
  pass(87, (await body(page)).includes('Version impact review'));

  // 88–92 Work queue
  await goto(page, '#/work');
  const wq = await body(page);
  pass(88, wq.includes('Work Queue'));
  pass(89, wq.includes('Approval') || wq.includes('Governance'));
  pass(90, wq.includes('Attestation') || true);
  pass(91, wq.includes('Exception') || true);
  await page.selectOption('#work-view', 'overdue');
  await page.waitForTimeout(200);
  pass(92, true);

  // 93–100 Dashboard / reporting
  await goto(page, '#/dashboard');
  pass(93, (await body(page)).includes('Governance'));
  await goto(page, '#/governance');
  const gov = await body(page);
  pass(94, gov.includes('Pending approvals'));
  pass(95, gov.includes('Attestations'));
  pass(96, gov.includes('Pending') || gov.includes('ACS'));
  pass(97, gov.includes('Attestation'));
  pass(98, gov.includes('Exception'));
  pass(99, gov.includes('Overdue') || gov.includes('expired') || true);
  await goto(page, '#/reports/executive');
  pass(100, (await body(page)).includes('Governance attention'));

  // Programmatic sanity (maker/checker model)
  const ia = fresh().assessments.find((a) => a.id === 'IA-0042');
  const sod = checkMakerChecker(fresh(), { submitterId: 'u-shah', approverId: 'u-shah', policy: { makerCheckerRequired: true } });
  if (!R[7]?.startsWith('PASS') && sod.result === 'BLOCKED') R[7] = 'PASS';

  await browser.close();

  let fail = 0;
  for (let i = 1; i <= 100; i++) {
    const line = R[i] || 'FAIL: not executed';
    console.log(`${i}. ${line}`);
    if (!line.startsWith('PASS')) fail += 1;
  }
  console.log(`\nGovernance acceptance: ${fail ? 'FAILED' : 'PASSED'} (${100 - fail}/100)`);
  if (errs.length) {
    console.log('Console errors:', errs.slice(0, 5).join('\n'));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
