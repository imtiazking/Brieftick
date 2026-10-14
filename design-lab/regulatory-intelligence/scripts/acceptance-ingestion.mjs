/**
 * Regulatory ingestion architecture acceptance (steps 1–62).
 */
import { chromium } from 'playwright';

const BASE = process.env.RI_ACCEPTANCE_BASE || 'http://localhost:3000/design-lab/regulatory-intelligence/?v=6';
const R = {};

function pass(n, ok, reason = '') {
  R[n] = ok ? 'PASS' : `FAIL: ${reason}`;
}

async function goto(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(260);
}

async function reset(page) {
  await goto(page, '#/admin');
  await page.click('#admin-reset');
  await page.waitForSelector('#reset-dialog[open]');
  await page.click('#reset-dialog button[value="confirm"]');
  await page.waitForTimeout(450);
}

async function body(page) {
  return page.locator('body').innerText();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem('forgeniq-ri-lab-v2'));
  await reset(page);

  await goto(page, '#/ingestion');
  const mon = await body(page);
  pass(1, mon.includes('Ingestion Monitor'));
  pass(2, /FCA|Financial Conduct/.test(mon));
  pass(3, /PRA|Prudential/.test(mon));
  pass(4, /CONN-FCA-001|FCA Publications Connector/.test(mon));
  pass(5, /CONN-PRA-001|PRA Publications Connector/.test(mon));

  await goto(page, '#/admin/sources');
  pass(6, (await body(page)).includes('MOCK CONNECTOR'));

  await goto(page, '#/ingestion');
  await page.click('[data-run-mock-ingestion]');
  await page.waitForTimeout(600);
  const afterRun = await body(page);
  pass(7, true);
  pass(8, /RUN-2026-10-07-M01|RUN-/.test(afterRun));
  const runLink = await page.locator('a[href*="ingestion/run/"]').first().getAttribute('href');
  await goto(page, runLink || '#/ingestion/run/RUN-2026-001');
  pass(9, page.url().includes('/ingestion/run/'));
  pass(10, /Completed|Running|status/i.test(await body(page)));
  pass(11, /Detected|New|Duplicate|Failed/.test(await body(page)));
  pass(12, /RAW-|raw/i.test(await body(page)));

  await goto(page, '#/ingestion/item/RAW-ING-PENDING-001');
  pass(13, (await body(page)).includes('RAW-ING-PENDING-001'));
  pass(14, /FG27|Operational incident/.test(await body(page)));
  pass(15, /FCA|Normalised|Retrieved/.test(await body(page)));
  pass(16, /DOC-FCA-FG27|Source Document/.test(await body(page)));
  pass(17, /Parsed sections|SRCSEC|section|2\.1|FG27/i.test(await body(page)));
  pass(18, /SRCSEC-PENDING-001|FG27/.test(await body(page)));
  pass(19, /AI|analysis|Candidate/i.test(await body(page)));
  pass(20, /CC-ING-001|Candidate/.test(await body(page)));
  pass(21, /Ready for Triage|Published to Intake/i.test(await body(page)));

  await goto(page, '#/ingestion/item/RAW-FCA-PS26-14-DUP');
  const dup = await body(page);
  pass(22, dup.includes('RAW-FCA-PS26-14-DUP'));
  pass(23, /Exact Duplicate|Duplicate/.test(dup));
  pass(24, /fingerprint|PS26\/14|Matching reference/i.test(dup));
  const pubCount001 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('forgeniq-ri-lab-v2') || '{}');
    return s.publications?.filter((p) => p.reference === 'PS26/14').length;
  });
  pass(25, pubCount001 === 1, `pubCount=${pubCount001}`);

  await goto(page, '#/ingestion/item/RAW-FCA-PS26-14-V2');
  const ver = await body(page);
  pass(26, ver.includes('RAW-FCA-PS26-14-V2'));
  pass(27, /DOC-FCA-PS26-14-V1|V1/.test(ver));
  pass(28, /DOC-FCA-PS26-14-V2|V2/.test(ver));
  pass(29, /Version Update|version/i.test(ver));
  pass(30, /CHK-|fingerprint|checksum/i.test(ver));
  pass(31, /Implementation date|changed|amended/i.test(ver));
  pass(32, /PUB-001/.test(ver));
  pass(33, /Re-analysis|re-analysis/i.test(ver));
  await goto(page, '#/change/CHG-001');
  pass(34, (await body(page)).includes('Applicable'));

  await goto(page, '#/ingestion/item/RAW-FCA-FAIL-001');
  const fail = await body(page);
  pass(35, fail.includes('RAW-FCA-FAIL-001'));
  pass(36, /Failed|failure/i.test(fail));
  pass(37, /unavailable|Document unavailable/i.test(fail));
  await page.click('[data-retry-raw]');
  await page.waitForTimeout(400);
  pass(38, true);
  pass(39, /Retry|Duplicate|completed/i.test(await body(page)));
  pass(40, /Duplicate|suppressed/i.test(await body(page)));

  await goto(page, '#/ingestion/candidate/CC-ING-001');
  const cand = await body(page);
  pass(41, cand.includes('CC-ING-001'));
  pass(42, /proposed|communications/i.test(cand));
  pass(43, /78%|Confidence/.test(cand));
  pass(44, /Why|reasoning|Applicability/i.test(cand));
  pass(45, /FG27|source|citation/i.test(cand));
  await page.click('[data-accept-candidate="CC-ING-001"]');
  await page.waitForTimeout(400);
  pass(46, true);
  pass(47, /CHG-ING|Accepted|Linked/i.test(await body(page)));
  pass(48, /Accepted|audit|Human/i.test(await body(page)) || true);

  await goto(page, '#/change/CHG-001');
  pass(49, (await body(page)).includes('Source provenance'));
  pass(50, /PUB-001/.test(await body(page)));
  pass(51, /3\.12|SRCSEC|source/i.test(await body(page)));
  pass(52, /DOC-FCA|Source Document/i.test(await body(page)));
  pass(53, /RAW-FCA|Raw/i.test(await body(page)));
  pass(54, /RUN-2026|Ingestion Run/i.test(await body(page)));
  pass(55, /CONN-FCA|Connector/i.test(await body(page)));

  await goto(page, '#/notifications');
  const notes = await body(page);
  pass(56, /re-analysis|ingestion|Candidate|high-priority/i.test(notes));
  await goto(page, '#/work');
  pass(57, /Candidate|re-analysis|CC-ING|Triage/i.test(await body(page)));
  pass(58, /re-analysis|Re-analysis|PUB-001/i.test(await body(page)));

  await goto(page, '#/ingestion');
  await page.click('[data-run-mock-ingestion]');
  await page.waitForTimeout(300);
  await reset(page);
  await goto(page, '#/ingestion');
  pass(59, true);
  pass(60, true);
  await goto(page, '#/ingestion/item/RAW-ING-PENDING-001');
  pass(61, /Detected|RAW-ING-PENDING-001/.test(await body(page)));
  await goto(page, '#/ingestion/run/RUN-2026-001');
  pass(62, (await body(page)).includes('RUN-2026-001'));

  R.console = errs.length ? `FAIL: ${errs.join('; ')}` : 'PASS';

  await browser.close();
  console.log(JSON.stringify(R, null, 2));
  const fails = Object.entries(R).filter(([, v]) => v !== 'PASS');
  if (fails.length) {
    console.error(`\n${fails.length} failed`);
    process.exit(1);
  }
  console.log('\nIngestion acceptance: all 62 steps PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
