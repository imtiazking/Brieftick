#!/usr/bin/env node
/**
 * Real-browser check of the Publications / Obligations terminal UI and quick-view modal (Phase 12).
 * Serves the Design Lab SOURCE tree locally in presentation mode (fictional data) - no network, no auth, no AI.
 *
 *   node scripts/eval/design-lab-terminal-browser-check.mjs [--screenshots=<dir>]
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playwrightLaunchOptions } from './playwright-ci-launch.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const stylesRoot = join(repoRoot, 'styles');
const shotArg = process.argv.find((a) => a.startsWith('--screenshots='));
const shotDir = shotArg ? shotArg.slice('--screenshots='.length) : '';
if (shotDir) mkdirSync(shotDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function serve() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    let file = null;
    if (rel.startsWith('/styles/')) file = join(stylesRoot, rel.slice(8));
    else if (rel.startsWith('/design-lab/regulatory-intelligence')) {
      let r = rel.slice('/design-lab/regulatory-intelligence'.length) || '/index.html';
      if (r.endsWith('/')) r += 'index.html';
      file = join(labRoot, r);
    }
    const root = rel.startsWith('/styles/') ? stylesRoot : labRoot;
    if (!file || !file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

const { server, origin } = await serve();
const browser = await chromium.launch(playwrightLaunchOptions());
const errors = [];

async function open(context, hash) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|fonts\.g|clerk/i.test(t)) errors.push(t.slice(0, 300));
  });
  await page.addInitScript(() => localStorage.setItem('forgeniq-ri-presentation-mode', '1'));
  await page.goto(`${origin}/design-lab/regulatory-intelligence/${hash}`, { waitUntil: 'domcontentloaded' });
  return page;
}

async function exercise(page, label, hash, kind) {
  const term = kind === 'publication' ? 'publications' : 'obligations';
  await page.goto(`${origin}/design-lab/regulatory-intelligence/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-ri-terminal="${term}"] tbody tr[data-ri-detail-row]`, { timeout: 15000 });
  const vp = page.viewportSize();

  const theme = await page.evaluate((k) => {
    const el = document.querySelector(`[data-ri-terminal="${k}"]`);
    const th = el.querySelector('thead th');
    return { bg: getComputedStyle(el).backgroundColor, headColor: th ? getComputedStyle(th).color : '', font: getComputedStyle(el).fontFamily };
  }, term);
  check(`${label}: charcoal background`, /rgb\((1[0-9]|[0-9]), ?(1[0-9]|[0-9]), ?(1[0-9]|[0-9]|2[0-9])\)/.test(theme.bg) || theme.bg.startsWith('rgb(12'), theme.bg);
  check(`${label}: emerald table headers`, theme.headColor === 'rgb(52, 211, 153)', theme.headColor);
  check(`${label}: monospace terminal font`, /JetBrains Mono|monospace/i.test(theme.font), theme.font);

  const peek = page.locator(`[data-ri-terminal="${term}"] button[data-ri-detail="${kind}"]`).first();
  const rowTitle = await peek.evaluate((b) => b.closest('tr').querySelector('a')?.textContent?.trim() || '');
  await peek.focus();
  await peek.press('Enter');
  const dialog = page.locator('dialog#ri-terminal-detail');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  // Measure geometry only once the pop-in animation (which starts 6px low) has finished.
  // Scoped to the dialog: other page animations may be infinite and never finish.
  await page.evaluate(() => {
    const d = document.getElementById('ri-terminal-detail');
    return Promise.race([
      Promise.all(d.getAnimations().map((a) => a.finished.catch(() => null))),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  });

  const geo = await page.evaluate(() => {
    const d = document.getElementById('ri-terminal-detail');
    const r = d.getBoundingClientRect();
    const back = getComputedStyle(d, '::backdrop');
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      w: r.width,
      blur: back.backdropFilter || back.webkitBackdropFilter || '',
      title: d.querySelector('h2')?.textContent || '',
      labelled: d.getAttribute('aria-labelledby'),
      focusInside: d.contains(document.activeElement),
      modal: d.matches(':modal'),
      bg: getComputedStyle(d).backgroundColor,
    };
  });
  check(`${label}: modal horizontally centred`, Math.abs(geo.cx - vp.width / 2) <= 2, `${geo.cx} vs ${vp.width / 2}`);
  check(`${label}: modal vertically centred`, Math.abs(geo.cy - vp.height / 2) <= 4, `${geo.cy} vs ${vp.height / 2}`);
  check(`${label}: modal fits viewport`, geo.w <= vp.width, String(geo.w));
  check(`${label}: backdrop blur applied`, /blur\(/.test(geo.blur), geo.blur);
  check(`${label}: true modal (inert background)`, geo.modal === true);
  check(`${label}: focus moved into dialog`, geo.focusInside === true);
  check(`${label}: dialog labelled by its title`, geo.labelled === 'ri-terminal-detail-title' && geo.title.length > 0);
  if (kind === 'publication') check(`${label}: modal title is the publication title`, geo.title.trim() === rowTitle || rowTitle.startsWith(geo.title.trim().slice(0, 20)), `${geo.title} / ${rowTitle}`);
  if (shotDir) await page.screenshot({ path: join(shotDir, `${label.replace(/\W+/g, '-')}-modal.png`) });

  // Tab must stay inside the dialog.
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  check(`${label}: Tab cannot leave the dialog`, await page.evaluate(() => document.getElementById('ri-terminal-detail').contains(document.activeElement)));

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  check(`${label}: Escape closes and returns focus to opener`, await peek.evaluate((b) => b === document.activeElement));

  // Backdrop click closes.
  await peek.click();
  await dialog.waitFor({ state: 'visible' });
  await page.mouse.click(4, 4);
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  check(`${label}: backdrop click closes`, true);

  // Clicking a plain cell opens it; clicking the record link navigates instead.
  const firstRow = page.locator(`[data-ri-terminal="${term}"] tbody tr[data-ri-detail-row]`).first();
  await firstRow.locator('td').last().click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  check(`${label}: row click opens modal`, true);
  const href = await dialog.locator('[data-ri-detail-open]').getAttribute('href');
  await dialog.locator('[data-ri-detail-open]').click();
  await page.waitForFunction((h) => location.hash === h, href, { timeout: 5000 });
  check(`${label}: "open full record" navigates and closes modal`, (await dialog.isVisible()) === false && href.startsWith(`#/${kind}/`), href);

  await page.goto(`${origin}/design-lab/regulatory-intelligence/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-ri-terminal="${term}"] tbody tr[data-ri-detail-row]`);
  await page.locator(`[data-ri-terminal="${term}"] tbody tr[data-ri-detail-row] a[href^="#/${kind}/"]`).first().click();
  await page.waitForTimeout(250);
  check(`${label}: record link navigates without opening modal`, (await dialog.count()) === 0 || (await dialog.isVisible()) === false);
  check(`${label}: record link changed route`, new RegExp(`#/${kind}/`).test(page.url()), page.url());
  if (shotDir) {
    await page.goto(`${origin}/design-lab/regulatory-intelligence/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-ri-terminal="${term}"] tbody tr`);
    await page.screenshot({ path: join(shotDir, `${label.replace(/\W+/g, '-')}-list.png`) });
  }
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await open(desktop, '#/library');
  await exercise(page, 'Publications (desktop)', '#/library', 'publication');

  // Search still filters (existing behaviour must not regress).
  await page.goto(`${origin}/design-lab/regulatory-intelligence/#/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#library-search');
  const total = await page.locator('[data-library-row]').count();
  await page.fill('#library-search', 'zzzz-no-such-publication-zzzz');
  const visible = await page.locator('[data-library-row]:visible').count();
  check('Publications: search still filters rows', total > 0 && visible === 0, `${visible}/${total}`);
  check('Publications: search input is labelled', (await page.locator('#library-search').getAttribute('aria-label')) === 'Search publications');

  await exercise(page, 'Obligations (desktop)', '#/obligations', 'obligation');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const m = await open(mobile, '#/library');
  await m.waitForSelector('[data-ri-terminal="publications"] button[data-ri-detail]');
  await m.locator('[data-ri-terminal="publications"] button[data-ri-detail]').first().click();
  await m.locator('dialog#ri-terminal-detail').waitFor({ state: 'visible' });
  const mg = await m.evaluate(() => {
    const r = document.getElementById('ri-terminal-detail').getBoundingClientRect();
    return { left: r.left, right: r.right, w: innerWidth };
  });
  check('Mobile: modal inside viewport (no horizontal overflow)', mg.left >= 0 && mg.right <= mg.w, JSON.stringify(mg));
  if (shotDir) await m.screenshot({ path: join(shotDir, 'publications-mobile-modal.png') });

  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`design-lab-terminal-browser-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
