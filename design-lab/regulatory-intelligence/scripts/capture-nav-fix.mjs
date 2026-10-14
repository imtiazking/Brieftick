import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '..', 'visual-review', 'after-nav-fix');
mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=nav-fix';

const ROUTES = [
  { file: 'dashboard', hash: '#/dashboard' },
  { file: 'change-CHG-001', hash: '#/change/CHG-001' },
  { file: 'board-report', hash: '#/reports/board' },
  { file: 'ingestion', hash: '#/ingestion' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await page.selectOption('#scenario-select', 'consumer-duty').catch(() => {});
  for (const r of ROUTES) {
    await page.goto(`${BASE}${r.hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `${r.file}.png`), fullPage: true });
  }
  await browser.close();
  console.log('Saved to', outDir);
}

main();
