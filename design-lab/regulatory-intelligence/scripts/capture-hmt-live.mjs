import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '..', 'visual-review', 'hmt-live');
mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=hmt-live';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [route, file] of [
    ['admin/sources', '01-admin-sources.png'],
    ['ingestion', '02-ingestion.png'],
    ['ingestion/live-verification', '03-live-verification.png'],
  ]) {
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, file), fullPage: route.includes('live-verification') });
  }
  await browser.close();
  console.log('Saved to', outDir);
}

main();
