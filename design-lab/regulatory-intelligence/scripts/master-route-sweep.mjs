/**
 * Visit registered RI hash routes — no blank screens.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=master-routes';
const ROUTES = [
  'dashboard',
  'intake',
  'library',
  'publication/PUB-001',
  'publication/PUB-001/source',
  'admin/sources',
  'changes',
  'changes/CHG-001',
  'assessments',
  'assessments/IA-0042',
  'obligations',
  'obligations/OBL-0142',
  'policies',
  'policies/POL-007',
  'risks',
  'risks/RSK-012',
  'controls',
  'controls/CTRL-022',
  'actions',
  'actions/ACT-018',
  'evidence',
  'evidence/EVD-009',
  'work',
  'notifications',
  'horizon',
  'governance',
  'governance/approval',
  'governance/attestation',
  'governance/exception',
  'governance/control-test',
  'ai-governance',
  'ai-governance/analysis',
  'ai-governance/model',
  'ai-governance/config',
  'ai-governance/use-case',
  'ai-operations',
  'ai-operations/AIEX-SEED-001',
  'assurance',
  'assurance/review',
  'assurance/finding',
  'assurance/attestation',
  'assurance/pack',
  'reports',
  'reports/board',
  'ingestion',
  'ingestion/live-verification',
  'demo',
  'admin/organisation',
  'admin/platform',
  'admin/health',
  'admin/readiness',
  'changes/DOES-NOT-EXIST',
  'totally-unknown-route',
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const results = [];

  for (const route of ROUTES) {
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(400);
    const mainText = await page.locator('#ri-main').innerText().catch(() => '');
    const blank = mainText.trim().length < 20;
    const notFound = /not found|unavailable|could not/i.test(mainText);
    const ok = !blank && (route.includes('DOES-NOT') || route.includes('unknown') ? notFound : !/not found/i.test(mainText) || route.includes('admin'));
    results.push({ route, blank, notFound, ok: !blank });
  }

  await browser.close();
  let fail = 0;
  results.forEach((r) => {
    const status = r.blank ? 'FAIL: blank' : 'PASS';
    if (r.blank) fail += 1;
    console.log(`${r.route}: ${status}`);
  });
  if (errors.length) {
    console.log('Page errors:', errors.slice(0, 5));
    fail += errors.length;
  }
  console.log(fail ? `ROUTE SWEEP FAILED (${fail})` : 'ROUTE SWEEP PASS');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
