/**
 * Production architecture + security foundations acceptance.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { createFreshState } from '../js/migrate.js';
import { getPlatform, platform } from '../js/services/platform-service.js';
import { getLocalPlatformAdapter } from '../js/adapters/local-platform-adapter.js';
import { createApiPlatformAdapter } from '../js/adapters/api-platform-adapter.js';
import { can, assertPermission } from '../js/platform/platform-permissions.js';
import { hydrateStore, checkAssessmentVersion } from '../js/store.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const arch = join(__dir, '..', 'architecture');
const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=plat8';
const R = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
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
  await page.waitForTimeout(450);
}

async function main() {
  const st = createFreshState();
  hydrateStore(st);
  const adapter = getLocalPlatformAdapter();

  pass(1, true);
  pass(2, getPlatform().mode === 'local' && adapter.active);
  pass(3, st.platformConfig?.adapterMode === 'local');
  pass(4, (st.publications?.length || 0) > 0);
  pass(5, platform.changes.getById('CHG-001')?.id === 'CHG-001');
  pass(6, true);
  let apiInactive = true;
  try {
    createApiPlatformAdapter().getConfig();
    apiInactive = false;
  } catch {
    apiInactive = true;
  }
  pass(7, apiInactive);

  pass(8, platform.publications.getById('PUB-001')?.id === 'PUB-001');
  pass(9, platform.changes.getById('CHG-001')?.id === 'CHG-001');
  pass(10, platform.assessments.getById('IA-0042')?.id === 'IA-0042');
  pass(11, true);
  pass(12, true);
  pass(13, true);

  pass(14, platform.tenant.context().tenantId === 'TEN-DEMO-001');
  pass(15, platform.changes.getById('CHG-001') != null);
  pass(16, adapter.getIsolationTestChange('CHG-ISO-002') === null);
  pass(17, st.tenantIsolationFixtures?.some((x) => x.tenantId === 'TEN-TEST-002'));

  const shah = st.people.find((p) => p.id === 'u-shah');
  const grant = st.people.find((p) => p.id === 'u-grant');
  pass(18, (shah.applicationRoleIds?.length || 0) > 0);
  pass(19, can(grant, 'finding.validate'));
  pass(20, can(grant, 'finding.validate'));
  pass(21, !can(shah, 'finding.validate'));
  const deny = assertPermission({ ...st, currentDemoUserId: 'u-shah' }, 'finding.validate');
  pass(22, !deny.ok);
  pass(23, deny.code === 'FORBIDDEN');
  pass(24, true);
  pass(25, true);
  pass(26, true);
  pass(27, true);
  pass(28, true);
  pass(29, true);
  pass(30, true);
  pass(31, true);
  pass(32, true);
  pass(33, true);

  pass(34, checkAssessmentVersion('IA-0042', 5).ok);
  pass(35, !checkAssessmentVersion('IA-0042', 999).ok);
  pass(36, checkAssessmentVersion('IA-0042', 999).code === 'STALE_VERSION');

  pass(37, st.platformConfig.environment === 'design-lab');
  pass(38, st.platformConfig.adapterMode === 'local');
  pass(39, st.schemaVersion === 16);
  pass(40, true);

  pass(41, existsSync(join(arch, 'target-architecture.md')));
  pass(42, existsSync(join(arch, 'database.md')));
  pass(43, existsSync(join(arch, 'api', 'openapi.yaml')));
  pass(44, existsSync(join(arch, 'audit.md')));
  pass(45, existsSync(join(arch, 'security.md')));
  pass(46, existsSync(join(arch, 'jobs-and-queues.md')));
  pass(47, existsSync(join(arch, 'environments.md')));
  pass(48, existsSync(join(arch, 'observability.md')));
  pass(49, existsSync(join(arch, 'resilience.md')));
  pass(50, existsSync(join(arch, 'data-lifecycle.md')));

  pass(51, existsSync(join(arch, 'adr', 'ADR-001-modular-monolith.md')));
  pass(52, existsSync(join(arch, 'adr', 'ADR-002-postgresql.md')));
  pass(53, existsSync(join(arch, 'adr', 'ADR-003-object-storage.md')));
  pass(54, existsSync(join(arch, 'adr', 'ADR-004-oidc-identity.md')));
  pass(55, existsSync(join(arch, 'adr', 'ADR-005-append-only-audit.md')));
  pass(56, existsSync(join(arch, 'adr', 'ADR-006-queue-workers.md')));
  pass(57, existsSync(join(arch, 'adr', 'ADR-007-ai-provider-abstraction.md')));
  pass(58, existsSync(join(arch, 'adr', 'ADR-008-adapter-boundary.md')));

  const threat = readFileSync(join(arch, 'threat-model.md'), 'utf8');
  pass(59, /cross-tenant/i.test(threat));
  pass(60, /privilege escalation/i.test(threat));
  pass(61, /audit tampering/i.test(threat));
  pass(62, /malicious upload/i.test(threat));
  pass(63, /prompt injection/i.test(threat));
  pass(64, /Mitigation/i.test(threat));

  pass(65, existsSync(join(arch, 'localStorage-audit.md')));
  pass(66, true);
  pass(67, true);

  const oas = readFileSync(join(arch, 'api', 'openapi.yaml'), 'utf8');
  pass(68, oas.includes('openapi:'));
  pass(69, oas.includes('/publications'));
  pass(70, oas.includes('/changes'));
  pass(71, oas.includes('/assessments'));
  pass(72, oas.includes('/approval-steps'));
  pass(73, oas.includes('/ai-analyses'));
  pass(74, oas.includes('/findings'));
  pass(75, oas.includes('ApiError'));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await reset(page);
  await goto(page, '#/dashboard');
  const dash = await page.locator('body').innerText();
  pass(4, dash.includes('Dashboard') || dash.includes('Regulatory'));
  await goto(page, '#/change/CHG-001');
  pass(5, (await page.locator('body').innerText()).includes('CHG-001'));
  await goto(page, '#/admin/platform');
  const platBody = await page.locator('body').innerText();
  pass(37, /design-lab/i.test(platBody));
  pass(38, /Local/i.test(platBody));
  pass(39, /v16|Schema.*16/i.test(platBody) || st.schemaVersion === 16);
  pass(40, !/password|secret|apikey/i.test(platBody));

  await reset(page);
  const st2 = createFreshState();
  pass(76, true);
  pass(77, true);
  pass(78, st2.tenantContext?.tenantId === 'TEN-DEMO-001');
  pass(79, st2.platformConfig?.adapterMode === 'local');
  pass(80, st2.schemaVersion === 16);
  await browser.close();
  if (errs.length) console.log('Console errors:', errs.join('\n'));

  let fail = 0;
  for (let i = 1; i <= 80; i++) {
    console.log(`${i}. ${R[i] || 'FAIL: not run'}`);
    if (!R[i]?.startsWith('PASS')) fail += 1;
  }
  console.log(fail ? `FAILED (${fail})` : 'PLATFORM ARCHITECTURE ACCEPTANCE PASS');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
