#!/usr/bin/env node
/**
 * Cross-browser scroll-surface checks (Chromium/Chrome/Edge, Firefox, WebKit) on hosted Design Lab.
 */
import { chromium, firefox, webkit } from 'playwright';
import { designLabEntry, OFFICIAL_STAGING_ORIGIN } from '../staging/staging-release-hosts.mjs';
import { launch, requireUatPersonas, verifyIdentity } from '../uat/staging-user-sessions.mjs';
import { playwrightLaunchOptions } from './playwright-ci-launch.mjs';

const LAB = designLabEntry(OFFICIAL_STAGING_ORIGIN);

await requireUatPersonas(['A'], { label: 'scrollbar-browsers' });

const { context: chCtx, page: chPage } = await launch('A', { headless: true });
await verifyIdentity(chPage, 'A');
const cookies = await chCtx.cookies();
await chCtx.close();

async function probeScroll(name, browserType) {
  const browser = await browserType.launch(playwrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  try {
    await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 });
    const sidebar = page.locator('.ri-sidebar');
    await sidebar.hover();
    const result = await page.evaluate(async () => {
      const el = document.querySelector('.ri-sidebar');
      if (!el) return { ok: false, reason: 'no_sidebar' };
      const cs = getComputedStyle(el);
      const href = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).find((h) => /ri\.css/.test(h));
      const cssText = href ? await (await fetch(href)).text() : '';
      return {
        ok:
          cs.overflowY === 'auto' &&
          (cs.scrollbarGutter === 'stable' || cs.scrollbarGutter === 'stable both-edges') &&
          /--ri-scroll-size:\s*4px/.test(cssText) &&
          /scrollbar-width:\s*thin/.test(cssText),
        gutter: cs.scrollbarGutter,
        overflowY: cs.overflowY,
        scrollable: el.scrollHeight > el.clientHeight,
      };
    });
    if (result.ok) {
      console.log('PASS', name, result.gutter, result.scrollable ? 'scrollable' : 'fits');
      return true;
    }
    console.error('FAIL', name, result);
    return false;
  } finally {
    await browser.close();
  }
}

let failed = 0;
if (!(await probeScroll('chromium', chromium))) failed += 1;
if (!(await probeScroll('firefox', firefox))) failed += 1;
if (!(await probeScroll('webkit', webkit))) failed += 1;

process.exit(failed ? 1 : 0);