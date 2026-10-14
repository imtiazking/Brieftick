import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '..', 'visual-review', 'final-master');
mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=final-master';

const shots = [
  ['dashboard', '01-dashboard.png'],
  ['dashboard', '02-product-switcher.png', async (page) => {
    await page.click('#product-menu-btn');
    await page.waitForTimeout(250);
  }],
  ['publication/PUB-001', '03-pub-001.png'],
  ['publication/PUB-001/source', '04-pub-001-source.png'],
  ['changes/CHG-001', '05-chg-001.png'],
  ['work', '06-work-queue.png'],
  ['notifications', '07-attention-centre.png'],
  ['governance', '08-governance.png'],
  ['ai-governance', '09-ai-governance.png'],
  ['assurance', '10-assurance.png'],
  ['reports/board', '11-board.png'],
  ['ingestion', '12-ingestion.png'],
  ['ingestion/live-verification', '13-live-verification.png'],
  ['demo', '14-demo-journeys.png'],
  ['admin/sources', '15-admin-sources.png'],
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [route, file, hook] of shots) {
    await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    if (hook) await hook(page);
    await page.screenshot({ path: join(outDir, file), fullPage: route.includes('CHG-001') });
  }
  await browser.close();
  console.log('Saved final-master screenshots to', outDir);
}

main();
