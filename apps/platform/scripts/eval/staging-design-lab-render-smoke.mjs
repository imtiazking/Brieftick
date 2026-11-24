#!/usr/bin/env node
/**
 * Staging Design Lab render smoke — visible DOM, not just HTTP 200.
 */
import { chromium } from 'playwright';

const LAB = 'https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/index.html';
const cases = [
  { name: 'dashboard', hash: '#/dashboard', expect: /dashboard|Regulatory intelligence/i },
  { name: 'invalid-ai-route', hash: '#/ai-a/broken', expect: /not found|unavailable|page could not/i },
  { name: 'triage-ai-findings', hash: '#/triage/ai-findings', expect: /AI findings|triage|sign in|connect/i },
];

let failed = 0;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

for (const c of cases) {
  await page.goto(`${LAB}${c.hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(2500);
  const riAppLen = await page.locator('#ri-app').innerHTML().then((h) => h.trim().length).catch(() => 0);
  const mainText = await page.evaluate(() => document.getElementById('ri-app')?.innerText || '');
  const ok = riAppLen > 5000 && c.expect.test(mainText);
  console.log(ok ? 'PASS' : 'FAIL', c.name, { riAppLen, sample: mainText.slice(0, 120).replace(/\s+/g, ' ') });
  if (!ok) failed += 1;
}

if (consoleErrors.some((e) => /resolvedSegment|already been declared/i.test(e))) {
  console.log('FAIL module parse error still present', consoleErrors);
  failed += 1;
} else if (consoleErrors.length) {
  console.log('WARN pageerrors', consoleErrors.slice(0, 5));
}

await browser.close();
if (failed) {
  console.error(`staging-design-lab-render-smoke: FAIL (${failed})`);
  process.exit(1);
}
console.log('staging-design-lab-render-smoke: PASS');