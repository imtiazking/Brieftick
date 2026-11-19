import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '..', 'visual-review', 'branding');
mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=brand-cap';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(outDir, 'header-dashboard.png') });
  await page.click('#product-menu-btn');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, 'product-switcher-open.png') });
  await browser.close();
  console.log('Saved branding screenshots to', outDir);
}

main();
