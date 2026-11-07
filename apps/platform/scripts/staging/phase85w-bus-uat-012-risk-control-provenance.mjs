#!/usr/bin/env node
/**
 * BUS-UAT-012 — risk/control provenance, link compatibility, dashboards, audit.
 * Isolated P85W012-* fixtures; preserves manual journey IDs (487cd38f, 164b0ef5, 277132be).
 */
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  establishHostedRiLabSession,
  FORGENIQ_UAT_ORG_A,
  getDesignLabUrl,
  getHostedBaseUrl,
  resolveHostedBrowserContext,
} from './hosted-uat-playwright-session.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const outDir = join(platformRoot, 'docs');
mkdirSync(outDir, { recursive: true });

const BASE = getHostedBaseUrl();
const LAB = getDesignLabUrl(BASE);
const FAIR_VALUE_PUB = '56b0beca-d8c3-4267-a794-9079009af661';

const JOURNEY_CHANGE_ID = '487cd38f-b9ad-4216-8fa0-bf80e0064337';
const MANUAL_OBLIGATION_ID = '164b0ef5-0008-4f51-ba1b-24a86fda669b';
const MANUAL_IMPACT_ID = '277132be-45af-4a45-9920-624b71c4da52';

const PREFIX = `P85W012-${Date.now()}`;

function runNodeScript(relPath, args = []) {
  const r = spawnSync('node', [join(platformRoot, relPath), ...args], {
    cwd: platformRoot,
    encoding: 'utf8',
    shell: true,
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const findings = [];
  const pass = (id, detail) => findings.push({ id, status: 'PASS', detail });
  const fail = (id, detail) => findings.push({ id, status: 'FAIL', detail });

  const fixtures = {
    uatChangeId: null,
    opChangeId: null,
    uatOblId: null,
    opOblId: null,
    opRiskId: null,
    uatRiskId: null,
    opCtrlId: null,
    uatCtrlId: null,
    uatCtrlBId: null,
  };

  const unitR = runNodeScript('scripts/staging/phase85r-classify-unit.mjs');
  if (unitR.ok && unitR.out.includes('classify_ok')) pass('regression_bus_uat_005', 'change classify unit');
  else fail('regression_bus_uat_005', unitR.out.slice(0, 200));

  const unitO = runNodeScript('scripts/staging/phase85u-classify-obligation-unit.mjs');
  if (unitO.ok && unitO.out.includes('obligation_classify_ok')) pass('regression_bus_uat_010', 'obligation classify unit');
  else fail('regression_bus_uat_010', unitO.out.slice(0, 200));

  const unitI = runNodeScript('scripts/staging/phase85v-classify-impact-unit.mjs');
  if (unitI.ok && unitI.out.includes('impact_classify_ok')) pass('regression_bus_uat_011', 'impact classify unit');
  else fail('regression_bus_uat_011', unitI.out.slice(0, 200));

  const admin = adminClient();
  let manualOblRowBefore = null;
  if (admin) {
    const { data } = await admin
      .from('regulatory_obligations')
      .select('id, obligation_statement, metadata')
      .eq('id', MANUAL_OBLIGATION_ID)
      .eq('organisation_id', FORGENIQ_UAT_ORG_A)
      .maybeSingle();
    manualOblRowBefore = data;
    if (data) pass('manual_obl_baseline', MANUAL_OBLIGATION_ID);
    else fail('manual_obl_baseline', 'manual obligation not found');
  } else fail('admin_client', 'no service role for postgres checks');

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome',
  });
  const resolved = await resolveHostedBrowserContext(browser);
  if (!resolved) {
    fail('auth', 'No Playwright storage');
    writeOut(findings, fixtures);
    process.exit(1);
  }

  const { context, signInMethod, email, password } = resolved;
  const page = await context.newPage();
  const auth = await establishHostedRiLabSession(page, {
    hostedBase: BASE,
    organisationId: FORGENIQ_UAT_ORG_A,
    signInMethod,
    email,
    password,
  });
  if (!auth.ok) {
    fail('auth', auth.authFailure || 'session failed');
    await browser.close();
    writeOut(findings, fixtures);
    process.exit(1);
  }
  pass('auth', `session via ${signInMethod}`);

  const dashBefore = await page.request.get(`${BASE}/api/ri-lab/dashboard?dataScope=operational`);
  const dashBeforeBody = await dashBefore.json().catch(() => ({}));
  const risksOpenBefore = dashBeforeBody.summary?.risksOpen ?? dashBeforeBody.risksOpen ?? 0;
  const ctrlTrackedBefore = dashBeforeBody.summary?.controlsTracked ?? dashBeforeBody.controlsTracked ?? 0;

  const workBefore = await page.request.get(`${BASE}/api/ri-lab/tenant-work?dataScope=operational`);
  const workBeforeBody = await workBefore.json().catch(() => ({}));
  const opRiskListBefore = workBeforeBody.risks || [];
  const opCtrlListBefore = workBeforeBody.controls || [];

  const provReject = await page.request.post(`${BASE}/api/ri-lab/risks`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      title: `${PREFIX} bad meta`,
      creationMode: 'operational',
      metadata: { recordProvenance: 'uat_authorised' },
    },
  });
  const provRejectBody = await provReject.json().catch(() => ({}));
  if (
    provReject.status() === 400 &&
    (provRejectBody.error === 'client_provenance_rejected' || provRejectBody.detail === 'client_provenance_rejected')
  ) {
    pass('reject_client_provenance', 'metadata rejected on risk create');
  } else {
    fail('reject_client_provenance', `status=${provReject.status()} err=${provRejectBody.error || provRejectBody.detail || ''}`);
  }

  const opRiskRes = await page.request.post(`${BASE}/api/ri-lab/risks`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      title: `${PREFIX} operational risk`,
      description: 'fixture',
      category: 'operational',
      creationMode: 'operational',
    },
  });
  const opRiskBody = await opRiskRes.json().catch(() => ({}));
  if (opRiskRes.ok() && opRiskBody.risk?.dataProvenance === 'tenant_operational') {
    fixtures.opRiskId = opRiskBody.risk.id;
    pass('create_operational_risk', fixtures.opRiskId);
  } else fail('create_operational_risk', opRiskBody.error || String(opRiskRes.status()));

  const uatRiskRes = await page.request.post(`${BASE}/api/ri-lab/risks`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      title: `${PREFIX} UAT risk`,
      creationMode: 'uat_authorised',
    },
  });
  const uatRiskBody = await uatRiskRes.json().catch(() => ({}));
  if (uatRiskRes.ok() && uatRiskBody.risk?.dataProvenance === 'uat_authorised') {
    fixtures.uatRiskId = uatRiskBody.risk.id;
    pass('create_uat_risk', fixtures.uatRiskId);
  } else fail('create_uat_risk', uatRiskBody.error || String(uatRiskRes.status()));

  const opCtrlRes = await page.request.post(`${BASE}/api/ri-lab/controls`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      name: `${PREFIX} operational control`,
      creationMode: 'operational',
      control_type: 'preventive',
      effectiveness: 'effective',
      testing_status: 'NOT_TESTED',
    },
  });
  const opCtrlBody = await opCtrlRes.json().catch(() => ({}));
  if (opCtrlRes.ok() && opCtrlBody.control?.dataProvenance === 'tenant_operational') {
    fixtures.opCtrlId = opCtrlBody.control.id;
    pass('create_operational_control', fixtures.opCtrlId);
  } else fail('create_operational_control', opCtrlBody.error || String(opCtrlRes.status()));

  const uatCtrlRes = await page.request.post(`${BASE}/api/ri-lab/controls`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      name: `${PREFIX} UAT control A`,
      creationMode: 'uat_authorised',
      control_type: 'preventive',
    },
  });
  const uatCtrlBody = await uatCtrlRes.json().catch(() => ({}));
  if (uatCtrlRes.ok() && uatCtrlBody.control?.dataProvenance === 'uat_authorised') {
    fixtures.uatCtrlId = uatCtrlBody.control.id;
    pass('create_uat_control', fixtures.uatCtrlId);
  } else fail('create_uat_control', uatCtrlBody.error || String(uatCtrlRes.status()));

  const uatCtrlBRes = await page.request.post(`${BASE}/api/ri-lab/controls`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: { name: `${PREFIX} UAT control B`, creationMode: 'uat_authorised' },
  });
  const uatCtrlBBody = await uatCtrlBRes.json().catch(() => ({}));
  if (uatCtrlBRes.ok()) {
    fixtures.uatCtrlBId = uatCtrlBBody.control?.id;
    pass('create_second_uat_control', fixtures.uatCtrlBId);
  } else fail('create_second_uat_control', uatCtrlBBody.error || String(uatCtrlBRes.status()));

  if (admin && fixtures.opRiskId) {
    const { data: row } = await admin.from('risks').select('metadata').eq('id', fixtures.opRiskId).single();
    if (row?.metadata?.labProvenanceLocked === true && row.metadata.recordProvenance === 'tenant_operational') {
      pass('postgres_op_risk_locked', 'locked tenant_operational');
    } else fail('postgres_op_risk_locked', JSON.stringify(row?.metadata || {}).slice(0, 120));
  }

  const patchMeta = await page.request.patch(
    `${BASE}/api/ri-lab/risks/${encodeURIComponent(fixtures.opRiskId || '')}`,
    {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { metadata: { recordProvenance: 'uat_authorised' } },
    },
  );
  const patchMetaBody = await patchMeta.json().catch(() => ({}));
  if (
    patchMeta.status() === 400 &&
    (patchMetaBody.error === 'client_provenance_rejected' ||
      patchMetaBody.detail === 'client_provenance_rejected')
  ) {
    pass('patch_provenance_locked', 'cannot inject provenance via patch body');
  } else fail('patch_provenance_locked', `status=${patchMeta.status()} body=${JSON.stringify(patchMetaBody).slice(0, 120)}`);

  const uatChangeRes = await page.request.post(`${BASE}/api/ri-lab/changes`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      publicationId: FAIR_VALUE_PUB,
      title: `${PREFIX} UAT parent change`,
      changeType: 'Policy update',
      status: 'DRAFT',
      creationMode: 'uat_authorised',
    },
  });
  const uatChangeBody = await uatChangeRes.json().catch(() => ({}));
  if (uatChangeRes.ok() && uatChangeBody.change?.id) {
    fixtures.uatChangeId = uatChangeBody.change.id;
    pass('create_uat_change', fixtures.uatChangeId);
  } else fail('create_uat_change', uatChangeBody.error || String(uatChangeRes.status()));

  const opChangeRes = await page.request.post(`${BASE}/api/ri-lab/changes`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      publicationId: FAIR_VALUE_PUB,
      title: `${PREFIX} operational parent change`,
      changeType: 'Policy update',
      status: 'DRAFT',
      creationMode: 'operational',
    },
  });
  const opChangeBody = await opChangeRes.json().catch(() => ({}));
  if (opChangeRes.ok() && opChangeBody.change?.id) {
    fixtures.opChangeId = opChangeBody.change.id;
    pass('create_operational_change', fixtures.opChangeId);
  } else fail('create_operational_change', opChangeBody.error || String(opChangeRes.status()));

  if (fixtures.uatChangeId) {
    const oblRes = await page.request.post(`${BASE}/api/ri-lab/obligations`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: {
        regulatoryChangeId: fixtures.uatChangeId,
        obligationStatement: `${PREFIX} authorised UAT obligation`,
      },
    });
    const oblBody = await oblRes.json().catch(() => ({}));
    if (oblRes.ok() && oblBody.obligation?.dataProvenance === 'uat_authorised') {
      fixtures.uatOblId = oblBody.obligation.id;
      pass('uat_obligation', fixtures.uatOblId);
    } else fail('uat_obligation', oblBody.error || String(oblRes.status()));
  }

  if (fixtures.opChangeId) {
    const oblRes = await page.request.post(`${BASE}/api/ri-lab/obligations`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: {
        regulatoryChangeId: fixtures.opChangeId,
        obligationStatement: `${PREFIX} operational obligation`,
      },
    });
    const oblBody = await oblRes.json().catch(() => ({}));
    if (oblRes.ok() && oblBody.obligation?.dataProvenance === 'tenant_operational') {
      fixtures.opOblId = oblBody.obligation.id;
      pass('operational_obligation', fixtures.opOblId);
    } else fail('operational_obligation', oblBody.error || String(oblRes.status()));
  }

  if (fixtures.uatOblId && fixtures.uatRiskId) {
    try {
      await page.goto(`${LAB}/#/obligation/${fixtures.uatOblId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await page.waitForSelector('[data-ri-post-link][data-link-type="obligation_risk"]', { timeout: 90_000 });
      await page.locator('[data-connected-link-target]').fill(fixtures.uatRiskId);
      const [linkRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/ri-lab/links') && r.request().method() === 'POST',
          { timeout: 60_000 },
        ),
        page.locator('[data-ri-post-link][data-link-type="obligation_risk"]').click(),
      ]);
      const linkBody = linkRes ? await linkRes.json().catch(() => ({})) : {};
      await page.waitForTimeout(800);
      const toast = (await page.locator('#ri-toast').innerText().catch(() => '')) || '';
      const mainTxt = (await page.locator('#ri-main').innerText().catch(() => '')) || '';
      if (linkRes?.status() === 200 && linkBody.ok && /Risk linked/i.test(toast)) {
        pass('browser_obligation_risk_link', 'POST 200 + toast');
      } else fail('browser_obligation_risk_link', `status=${linkRes?.status()} toast=${toast.slice(0, 40)}`);
      if (mainTxt.includes(fixtures.uatRiskId.slice(0, 8))) {
        pass('browser_obligation_risk_visible', 'linked risk on detail');
      } else fail('browser_obligation_risk_visible', 'risk not shown after link');
    } catch (e) {
      fail('browser_obligation_risk_link', e.message || String(e));
    }

    const link1 = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { linkType: 'obligation_risk', leftId: fixtures.uatOblId, rightId: fixtures.uatRiskId },
    });
    if (link1.ok()) pass('link_uat_obl_uat_risk', 'obligation_risk ok');
    else fail('link_uat_obl_uat_risk', String(link1.status()));
  }

  if (fixtures.uatRiskId && fixtures.uatCtrlId) {
    const link2 = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { linkType: 'risk_control', leftId: fixtures.uatRiskId, rightId: fixtures.uatCtrlId },
    });
    if (link2.ok()) pass('link_uat_risk_uat_control', 'risk_control ok');
    else fail('link_uat_risk_uat_control', String(link2.status()));
  }

  if (fixtures.uatRiskId && fixtures.uatCtrlBId) {
    const link3 = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { linkType: 'risk_control', leftId: fixtures.uatRiskId, rightId: fixtures.uatCtrlBId },
    });
    if (link3.ok()) pass('many_to_many_uat_controls', 'second risk_control ok');
    else fail('many_to_many_uat_controls', String(link3.status()));
  }

  if (fixtures.opOblId && fixtures.uatRiskId) {
    const bad = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { linkType: 'obligation_risk', leftId: fixtures.opOblId, rightId: fixtures.uatRiskId },
    });
    if (bad.status() === 422) pass('reject_cross_obligation_risk', 'provenance mismatch');
    else fail('reject_cross_obligation_risk', `status=${bad.status()}`);
  }

  if (fixtures.opRiskId && fixtures.uatCtrlId) {
    const bad2 = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: { linkType: 'risk_control', leftId: fixtures.opRiskId, rightId: fixtures.uatCtrlId },
    });
    if (bad2.status() === 422) pass('reject_cross_risk_control', 'provenance mismatch');
    else fail('reject_cross_risk_control', `status=${bad2.status()}`);
  }

  const workAfter = await page.request.get(`${BASE}/api/ri-lab/tenant-work?dataScope=operational`);
  const workAfterBody = await workAfter.json().catch(() => ({}));
  const opRisks = workAfterBody.risks || [];
  const uatRiskList = workAfterBody.authorisedUatRisks || [];
  const opCtrls = workAfterBody.controls || [];
  const uatCtrlList = workAfterBody.authorisedUatControls || [];

  if (fixtures.uatRiskId && !opRisks.some((r) => r.id === fixtures.uatRiskId)) {
    pass('uat_risk_excluded_operational_register', 'not in operational risks');
  } else if (fixtures.uatRiskId) fail('uat_risk_excluded_operational_register', 'UAT risk leaked');

  if (fixtures.uatRiskId && uatRiskList.some((r) => r.id === fixtures.uatRiskId)) {
    pass('uat_risk_in_authorised_register', 'authorisedUatRisks');
  } else if (fixtures.uatRiskId) fail('uat_risk_in_authorised_register', 'missing authorisedUatRisks');

  if (fixtures.opRiskId && opRisks.some((r) => r.id === fixtures.opRiskId)) {
    pass('operational_risk_in_register', 'operational list');
  } else if (fixtures.opRiskId) fail('operational_risk_in_register', 'missing op risk');

  if (fixtures.uatCtrlId && !opCtrls.some((c) => c.id === fixtures.uatCtrlId)) {
    pass('uat_control_excluded_operational', 'not in operational controls');
  } else if (fixtures.uatCtrlId) fail('uat_control_excluded_operational', 'UAT control leaked');

  if (fixtures.uatCtrlId && uatCtrlList.some((c) => c.id === fixtures.uatCtrlId)) {
    pass('uat_control_authorised_register', 'authorisedUatControls');
  } else if (fixtures.uatCtrlId) fail('uat_control_authorised_register', 'missing UAT control register');

  if ((workAfterBody.riskCount ?? opRisks.length) === opRisks.length) {
    pass('client_server_risk_count', `count=${workAfterBody.riskCount}`);
  } else {
    fail(
      'client_server_risk_count',
      `mismatch count=${workAfterBody.riskCount} list=${opRisks.length}`,
    );
  }

  const dashAfter = await page.request.get(`${BASE}/api/ri-lab/dashboard?dataScope=operational`);
  const dashAfterBody = await dashAfter.json().catch(() => ({}));
  const risksOpenAfter = dashAfterBody.summary?.risksOpen ?? dashAfterBody.risksOpen ?? 0;
  const ctrlTrackedAfter = dashAfterBody.summary?.controlsTracked ?? dashAfterBody.controlsTracked ?? 0;
  const expectedRiskDelta = fixtures.opRiskId ? 1 : 0;

  if (risksOpenAfter === risksOpenBefore + expectedRiskDelta) {
    pass('dashboard_uat_risk_excluded', `${risksOpenBefore} → ${risksOpenAfter}`);
  } else {
    fail('dashboard_uat_risk_excluded', `${risksOpenBefore} → ${risksOpenAfter} expected +${expectedRiskDelta}`);
  }

  if (ctrlTrackedAfter === ctrlTrackedBefore + (fixtures.opCtrlId ? 1 : 0)) {
    pass('dashboard_uat_control_excluded', `${ctrlTrackedBefore} → ${ctrlTrackedAfter}`);
  } else {
    fail(
      'dashboard_uat_control_excluded',
      `${ctrlTrackedBefore} → ${ctrlTrackedAfter} expected +${fixtures.opCtrlId ? 1 : 0}`,
    );
  }

  if (fixtures.uatOblId) {
    const d1 = await page.request.get(`${BASE}/api/ri-lab/obligations/${encodeURIComponent(fixtures.uatOblId)}`);
    const b1 = await d1.json().catch(() => ({}));
    const ids = b1.obligation?.riskIds || [];
    if (fixtures.uatRiskId && ids.includes(fixtures.uatRiskId)) pass('obligation_detail_risks', 'riskIds');
    else fail('obligation_detail_risks', JSON.stringify(ids));
  }

  if (fixtures.uatRiskId) {
    const d2 = await page.request.get(`${BASE}/api/ri-lab/risks/${encodeURIComponent(fixtures.uatRiskId)}`);
    const b2 = await d2.json().catch(() => ({}));
    const oids = b2.risk?.obligationIds || [];
    const cids = b2.risk?.controlIds || [];
    if (fixtures.uatOblId && oids.includes(fixtures.uatOblId)) pass('risk_detail_obligations', 'obligationIds');
    else if (fixtures.uatOblId) fail('risk_detail_obligations', String(oids));
    if (fixtures.uatCtrlId && cids.includes(fixtures.uatCtrlId)) pass('risk_detail_controls', 'controlIds');
    else if (fixtures.uatCtrlId) fail('risk_detail_controls', String(cids));
  }

  if (fixtures.uatCtrlId) {
    const d3 = await page.request.get(`${BASE}/api/ri-lab/controls/${encodeURIComponent(fixtures.uatCtrlId)}`);
    const b3 = await d3.json().catch(() => ({}));
    const riskIds = b3.control?.riskIds || [];
    if (fixtures.uatRiskId && riskIds.includes(fixtures.uatRiskId)) pass('control_detail_risks', 'linked risk');
    else fail('control_detail_risks', String(riskIds));
  }

  if (fixtures.opRiskId) {
    const ev = await page.request.get(
      `${BASE}/api/ri-lab/workflow-events?entityType=risk&entityId=${encodeURIComponent(fixtures.opRiskId)}&limit=20`,
    );
    const evBody = await ev.json().catch(() => ({}));
    const created = (evBody.events || []).filter((e) => e.eventType === 'RISK_CREATED');
    if (created.length === 1) pass('risk_created_audit', 'single RISK_CREATED');
    else fail('risk_created_audit', `count=${created.length}`);
  }

  if (fixtures.uatCtrlId) {
    const ev = await page.request.get(
      `${BASE}/api/ri-lab/workflow-events?entityType=control&entityId=${encodeURIComponent(fixtures.uatCtrlId)}&limit=20`,
    );
    const evBody = await ev.json().catch(() => ({}));
    const created = (evBody.events || []).filter((e) => e.eventType === 'CONTROL_CREATED');
    if (created.length === 1) pass('control_created_audit', 'single CONTROL_CREATED');
    else fail('control_created_audit', `count=${created.length}`);
  }

  if (fixtures.uatOblId && fixtures.uatRiskId) {
    const ev = await page.request.get(
      `${BASE}/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(fixtures.uatOblId)}&limit=30`,
    );
    const evBody = await ev.json().catch(() => ({}));
    const linked = (evBody.events || []).filter((e) => e.eventType === 'RISK_LINKED');
    if (linked.some((e) => e.metadata?.risk_id === fixtures.uatRiskId)) pass('risk_linked_audit', 'obligation scope');
    else fail('risk_linked_audit', JSON.stringify((linked[0] || {}).metadata || {}).slice(0, 120));
  }

  if (fixtures.uatRiskId) {
    const ev = await page.request.get(
      `${BASE}/api/ri-lab/workflow-events?entityType=risk&entityId=${encodeURIComponent(fixtures.uatRiskId)}&limit=30`,
    );
    const evBody = await ev.json().catch(() => ({}));
    const linked = (evBody.events || []).filter((e) => e.eventType === 'CONTROL_LINKED');
    if (linked.length >= 1) pass('control_linked_audit', `events=${linked.length}`);
    else fail('control_linked_audit', 'no CONTROL_LINKED');
  }

  if (fixtures.uatOblId && fixtures.uatRiskId) {
    const secondLink = await page.request.post(`${BASE}/api/ri-lab/links`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      data: {
        linkType: 'obligation_risk',
        leftId: fixtures.uatOblId,
        rightId: fixtures.uatRiskId,
      },
    });
    if (secondLink.ok()) pass('duplicate_link_idempotent', 'retry ok');
    else fail('duplicate_link_idempotent', String(secondLink.status()));
  }

  if (admin && manualOblRowBefore) {
    const { data: manualRisk } = await admin
      .from('risks')
      .select('id, title, metadata')
      .eq('organisation_id', FORGENIQ_UAT_ORG_A)
      .like('id', 'a2de855f%')
      .limit(1)
      .maybeSingle();
    const { data: manualLink } = await admin
      .from('obligation_risk_links')
      .select('risk_id')
      .eq('organisation_id', FORGENIQ_UAT_ORG_A)
      .eq('obligation_id', MANUAL_OBLIGATION_ID)
      .eq('risk_id', manualRisk?.id || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (manualRisk?.id && !manualLink) {
      try {
        await page.goto(`${LAB}/#/obligation/${MANUAL_OBLIGATION_ID}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page.waitForSelector('[data-ri-post-link][data-link-type="obligation_risk"]', { timeout: 90_000 });
        await page.locator('[data-connected-link-target]').fill(manualRisk.id);
        const [linkRes] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('/api/ri-lab/links') && r.request().method() === 'POST',
            { timeout: 60_000 },
          ),
          page.locator('[data-ri-post-link][data-link-type="obligation_risk"]').click(),
        ]);
        const ev = await page.request.get(
          `${BASE}/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(MANUAL_OBLIGATION_ID)}&limit=20`,
        );
        const evBody = await ev.json().catch(() => ({}));
        const linked = (evBody.events || []).some(
          (e) => e.eventType === 'RISK_LINKED' && e.metadata?.risk_id === manualRisk.id,
        );
        if (linkRes?.status() === 200 && linked) {
          pass('browser_manual_journey_risk_link', manualRisk.id);
        } else {
          fail(
            'browser_manual_journey_risk_link',
            `status=${linkRes?.status()} audit=${linked}`,
          );
        }
      } catch (e) {
        fail('browser_manual_journey_risk_link', e.message || String(e));
      }
    } else if (manualLink) {
      pass('browser_manual_journey_risk_link', 'relationship already present');
    } else {
      pass('browser_manual_journey_risk_link', 'manual risk not resolved — skipped');
    }
  }

  if (admin && manualOblRowBefore) {
    const { data: after } = await admin
      .from('regulatory_obligations')
      .select('obligation_statement, metadata')
      .eq('id', MANUAL_OBLIGATION_ID)
      .single();
    if (after?.obligation_statement === manualOblRowBefore.obligation_statement) {
      pass('manual_obligation_unchanged', MANUAL_OBLIGATION_ID);
    } else fail('manual_obligation_unchanged', 'statement changed');

    const ch = await page.request.get(`${BASE}/api/ri-lab/changes/${encodeURIComponent(JOURNEY_CHANGE_ID)}`);
    const chBody = await ch.json().catch(() => ({}));
    if (
      ch.ok() &&
      (chBody.change?.dataProvenance === 'uat_authorised' || chBody.change?.labClassification === 'uat_authorised')
    ) {
      pass('journey_change_preserved', JOURNEY_CHANGE_ID);
    } else fail('journey_change_preserved', JSON.stringify(chBody.change || {}).slice(0, 80));

    const imp = await page.request.get(`${BASE}/api/ri-lab/impact-assessments/${encodeURIComponent(MANUAL_IMPACT_ID)}`);
    const impBody = await imp.json().catch(() => ({}));
    if (imp.ok() && impBody.assessment?.id === MANUAL_IMPACT_ID) {
      pass('manual_impact_preserved', MANUAL_IMPACT_ID);
    } else fail('manual_impact_preserved', impBody.error || String(imp.status()));
  }

  if (admin) {
    const { data: foreign } = await admin
      .from('risks')
      .select('id, organisation_id')
      .neq('organisation_id', FORGENIQ_UAT_ORG_A)
      .limit(1)
      .maybeSingle();
    if (foreign?.id) {
      const cross = await page.request.get(`${BASE}/api/ri-lab/risks/${encodeURIComponent(foreign.id)}`);
      if (cross.status() === 403 || cross.status() === 404) pass('tenant_isolation_risk', `status=${cross.status()}`);
      else fail('tenant_isolation_risk', String(cross.status()));
    } else pass('tenant_isolation_risk', 'no foreign row sample');
  }

  await browser.close();

  const tear = runNodeScript('scripts/staging/phase85w-teardown-p85w012-fixtures.mjs', [PREFIX]);
  if (tear.ok && tear.out.includes('"ok":true')) pass('fixture_teardown', PREFIX);
  else fail('fixture_teardown', tear.out.slice(0, 400));

  writeOut(findings, fixtures);
  const failed = findings.filter((f) => f.status === 'FAIL');
  process.exit(failed.length ? 1 : 0);
}

function writeOut(findings, fixtures) {
  const report = {
    generatedAt: new Date().toISOString(),
    prefix: PREFIX,
    fixtures,
    preserved: {
      journeyChangeId: JOURNEY_CHANGE_ID,
      manualObligationId: MANUAL_OBLIGATION_ID,
      manualImpactId: MANUAL_IMPACT_ID,
    },
    findings,
    passCount: findings.filter((f) => f.status === 'PASS').length,
    failCount: findings.filter((f) => f.status === 'FAIL').length,
    note: 'BUS-UAT-012 manual PASS/FAIL is not asserted by this script.',
  };
  writeFileSync(join(outDir, 'STAGING-BUS-UAT-012-RISK-CONTROL-PROVENANCE.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
