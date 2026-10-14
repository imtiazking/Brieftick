/**
 * Capture RI visual audit screenshots at 1440px.
 * Usage: node design-lab/regulatory-intelligence/scripts/capture-visual-audit.mjs [before|after]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2] === 'after' ? 'after' : 'before';
const outDir = join(__dir, '..', 'visual-review', phase);
mkdirSync(outDir, { recursive: true });

const BASE = 'http://localhost:3000/design-lab/regulatory-intelligence/?v=visual';

const ROUTES = [
  { file: 'dashboard', hash: '#/dashboard' },
  { file: 'intake', hash: '#/intake' },
  { file: 'publication-PUB-001', hash: '#/publication/PUB-001' },
  { file: 'publication-PUB-001-source', hash: '#/publication/PUB-001/source' },
  { file: 'change-CHG-001', hash: '#/change/CHG-001' },
  { file: 'work-queue', hash: '#/work' },
  { file: 'attention-centre', hash: '#/notifications' },
  { file: 'governance', hash: '#/governance' },
  { file: 'ai-governance', hash: '#/ai-governance' },
  { file: 'assurance', hash: '#/assurance' },
  { file: 'board-report', hash: '#/reports/board' },
  { file: 'ingestion', hash: '#/ingestion' },
  { file: 'live-verification', hash: '#/ingestion/live-verification' },
  { file: 'demo-journeys', hash: '#/demo' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await page.selectOption('#scenario-select', 'consumer-duty').catch(() => {});

  for (const r of ROUTES) {
    await page.goto(`${BASE}${r.hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const path = join(outDir, `${r.file}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log('saved', path);
  }

  await browser.close();
  console.log(`Done: ${phase} (${ROUTES.length} screens)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
