#!/usr/bin/env node
/**
 * Unauthenticated Design Lab render smoke.
 * Serves the design-lab tree and fails if any mandatory route leaves a blank shell.
 *
 *   node scripts/eval/design-lab-browser-smoke.mjs
 *   node scripts/eval/design-lab-browser-smoke.mjs --base https://preview.example
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playwrightLaunchOptions } from './playwright-ci-launch.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const stylesRoot = join(repoRoot, 'styles');

const ROUTES = [
  { hash: '#/dashboard', heading: /dashboard|regulatory|material|attention/i, name: 'Dashboard' },
  { hash: '#/library', heading: /publication|library/i, name: 'Publications' },
  { hash: '#/triage/ai-findings', heading: /AI Findings/i, name: 'AI Findings' },
  { hash: '#/triage/verified-obligations', heading: /Verified Obligations/i, name: 'Verified Obligations' },
  { hash: '#/triage/non-obligations', heading: /Non-Obligations/i, name: 'Non-Obligations' },
  { hash: '#/triage/rejected', heading: /Rejected Findings/i, name: 'Rejected Findings' },
  { hash: '#/triage/exceptions', heading: /Exceptions/i, name: 'Exceptions' },
  { hash: '#/triage/not-applicable', heading: /Not Applicable/i, name: 'Not Applicable' },
  { hash: '#/triage/all', heading: /All Findings/i, name: 'All Findings' },
  { hash: '#/work', heading: /My Tasks/i, name: 'My Tasks' },
  { hash: '#/notifications', heading: /Attention|notification|exception/i, name: 'Attention Centre' },
  { hash: '#/admin/qa', heading: /Quality assurance/i, name: 'Quality assurance' },
  { hash: '#/this-route-does-not-exist', heading: /not found|no view|dashboard/i, name: 'Invalid route' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function startStatic() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/__boot_fail.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<!DOCTYPE html><html><body>
        <div id="ri-boot-fallback" hidden><h1>FORGENIQ is temporarily unable to load.</h1><span id="ri-boot-ref"></span></div>
        <script>
          window.addEventListener('error', function () {
            var el = document.getElementById('ri-boot-fallback');
            el.hidden = false;
            document.getElementById('ri-boot-ref').textContent = 'RI-MODULE';
          });
        </script>
        <script type="module">throw new Error('boot_failed');</script>
      </body></html>`);
      return;
    }
    if (rel.startsWith('/styles/')) {
      const file = join(stylesRoot, rel.slice('/styles/'.length));
      if (!file.startsWith(stylesRoot) || !existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' });
      res.end(readFileSync(file));
      return;
    }
    const prefix = '/design-lab/regulatory-intelligence';
    if (!rel.startsWith(prefix)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    rel = rel.slice(prefix.length) || '/index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(labRoot, rel);
    if (!file.startsWith(labRoot) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const baseArg = process.argv.find((a) => a.startsWith('--base=')) || (process.env.FORGENIQ_SMOKE_BASE ? `--base=${process.env.FORGENIQ_SMOKE_BASE}` : '');
let origin = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : '';
let server;
if (!origin) {
  ({ server, origin } = await startStatic());
}

const browser = await chromium.launch(playwrightLaunchOptions());
const extraHTTPHeaders = {};
if (process.env.VERCEL_OIDC_TOKEN) {
  extraHTTPHeaders['x-vercel-trusted-oidc-idp-token'] = process.env.VERCEL_OIDC_TOKEN;
}
const context = await browser.newContext({ extraHTTPHeaders });
const page = await context.newPage();
if (!baseArg) {
  await page.addInitScript(() => {
    localStorage.setItem('forgeniq-ri-presentation-mode', '1');
  });
}
const results = [];
let fatal = [];

page.on('pageerror', (err) => {
  fatal.push(String(err?.message || err).slice(0, 400));
});
page.on('console', (msg) => {
  const text = msg.text();
  if (
    msg.type() === 'error' &&
    !text.includes('Failed to load resource') &&
    !text.includes('fonts.gstatic.com') &&
    !text.includes('x-vercel-trusted-oidc-idp-token')
  ) {
    if (/clerk\.forgeniq\.com|clerk\.browser\.js|blocked by CORS policy/i.test(text)) {
      fatal.push(`clerk-cors:${text.slice(0, 180)}`);
      return;
    }
    fatal.push(text.slice(0, 400));
  }
});
page.on('response', (res) => {
  const type = res.headers()['content-type'] || '';
  if (type.includes('octet-stream') || (res.status() >= 400 && res.url().includes('/js/'))) {
    fatal.push(`${res.status()} ${type} ${res.url()}`);
  }
});
page.on('requestfailed', (req) => {
  const url = req.url();
  if (url.includes('/js/') && !url.includes('clerk')) {
    fatal.push(`failed ${url} ${req.failure()?.errorText || ''}`);
  }
});

for (const route of ROUTES) {
  fatal = [];
  const url = `${origin}/design-lab/regulatory-intelligence/index.html${route.hash}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const mountTimeout = isCi ? 45_000 : 15_000;
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: mountTimeout }).catch(() => {});
  const mounted = await page.evaluate(() => document.documentElement.dataset.riMounted === '1');
  const nav = await page.locator('nav.ri-topnav').count();
  let heading = await page.locator('h1').first().innerText().catch(() => '');
  for (let i = 0; i < 8 && /connecting/i.test(heading); i += 1) {
    await page.waitForTimeout(1000);
    heading = await page.locator('h1').first().innerText().catch(() => heading);
  }
  const fallback = await page.locator('#ri-boot-fallback:not([hidden])').count();
  const appLen = await page.evaluate(() => document.getElementById('ri-app')?.innerText?.length || 0);
  const triage = route.hash.startsWith('#/triage/');
  const table = triage ? await page.locator('[data-triage-screen], table, .ri-panel').count() : 1;
  const myTasks = route.hash === '#/work' ? await page.locator('[data-my-tasks-screen], table, .ri-muted').count() : 1;
  if (!baseArg && route.hash === '#/admin/qa') {
    if (isCi) {
      if (!/quality assurance/i.test(heading)) fatal.push('qa shell heading missing');
    } else {
      await page.waitForFunction(
        () => /Technical tests:/.test(document.querySelector('[data-qa-status]')?.textContent || ''),
        null,
        { timeout: 8000 },
      ).catch(() => {});
      const qaText = await page.locator('[data-qa-status]').innerText().catch(() => '');
      if (
        !/Technical tests:\s*(PASS|FAIL|NOT RUN|BLOCKED)/i.test(qaText) ||
        !/Business UAT approved:\s*no/i.test(qaText) ||
        !/Production authorised:\s*no/i.test(qaText)
      ) {
        fatal.push(`qa dashboard verdict missing: ${qaText.slice(0, 220)}`);
      }
    }
  }
  const authGate = /sign in|backend unavailable|organisation access/i.test(heading);
  const contentOk = baseArg ? authGate || route.heading.test(heading) : route.heading.test(heading);
  const blocking = fatal.filter((entry) => !String(entry).startsWith('clerk-cors:'));
  const clerkOnly = fatal.length > 0 && blocking.length === 0;
  const ok =
    mounted &&
    nav > 0 &&
    contentOk &&
    fallback === 0 &&
    appLen > 40 &&
    blocking.length === 0 &&
    (!clerkOnly || authGate) &&
    (baseArg || table > 0) &&
    (baseArg || myTasks > 0);
  results.push({
    name: route.name,
    hash: route.hash,
    ok,
    mounted,
    heading: heading.slice(0, 80),
    appLen,
    fallback,
    errors: fatal.slice(0, 3),
  });
  if (!ok) console.error('FAIL', route.name, results.at(-1));
  else console.log('PASS', route.name, heading.slice(0, 60));
  if (!baseArg && !isCi && ok && ['Dashboard', 'My Tasks', 'AI Findings'].includes(route.name)) {
    const shotDir = join(repoRoot, 'docs', 'uat', 'evidence', 'stability-gate-2026-11-24');
    mkdirSync(shotDir, { recursive: true });
    const file = route.name.toLowerCase().replace(/\s+/g, '-') + '.png';
    await page.screenshot({ path: join(shotDir, file), fullPage: true });
  }
}

if (!baseArg) {
  await page.goto(`${origin}/__boot_fail.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const recovery = await page.locator('#ri-boot-fallback:not([hidden])').innerText();
  const recoveryOk = /temporarily unable to load/i.test(recovery) && /RI-MODULE/.test(recovery);
  results.push({ name: 'Recovery screen', hash: '/__boot_fail.html', ok: recoveryOk, heading: recovery.slice(0, 80) });
  console.log(recoveryOk ? 'PASS' : 'FAIL', 'Recovery screen');
}

await context.close();
await browser.close();
server?.close();

const failed = results.filter((r) => !r.ok);
const authWall = failed.length > 0 && failed.every((r) => /log in to vercel/i.test(r.heading || ''));
if (authWall) {
  console.error('design-lab-browser-smoke: AUTH_BLOCKED Vercel authentication wall. This is not an application defect.');
  process.exit(2);
}
if (failed.length) {
  console.error(`design-lab-browser-smoke: FAIL ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log(`design-lab-browser-smoke: PASS ${results.length} routes @ ${origin}`);
