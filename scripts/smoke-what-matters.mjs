/**
 * What Matters live feed smoke test.
 * Usage: node scripts/smoke-what-matters.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = (process.argv[2] || "https://www.forgeniq.com/").replace(/\/?$/, "/");
const STALE = [
  "Fed Officials Speaking This Week",
  "Inflation Report Tomorrow",
  "Stock Market Rule Changes Under Review",
  "Oil Producers Meeting on Supply",
];
const BANNED = [/this week/i, /tomorrow/i, /under review/i];

let failed = 0;
function pass(msg, detail = "") {
  console.log(`PASS  ${msg}${detail ? ` — ${detail}` : ""}`);
}
function fail(msg, detail = "") {
  failed++;
  console.error(`FAIL  ${msg}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(3000);

  const chips = page.locator("#page-dashboard .intel-wheel__chip");
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    const t = await chips.nth(i).textContent();
    if (t && /what matters/i.test(t)) {
      await chips.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(8000);

  const audit = await page.evaluate(() => {
    const root = document.querySelector("#wheelModuleStage .rail-module--what-matters");
    const cards = [...(root?.querySelectorAll(".alert-visual") || [])].map((c) => ({
      id: c.dataset.alertId,
      source: c.dataset.cardSource || c.querySelector(".alert-visual__source")?.textContent?.trim(),
      date: c.querySelector(".alert-visual__date")?.textContent?.trim(),
      dateIso: c.querySelector(".alert-visual__date")?.getAttribute("datetime"),
      event: c.querySelector(".alert-visual__head")?.textContent?.trim(),
      importance: c.querySelector(".alert-visual__importance")?.textContent?.trim(),
    }));
    const empty = root?.querySelector("[data-what-matters-empty]")?.textContent?.trim();
    const refreshed = root?.querySelector("[data-what-matters-refreshed]")?.textContent?.trim();
    const refreshedAt = root?.querySelector("[data-what-matters-refreshed]")?.dataset?.refreshedAt;
    const sourceLabel = root?.querySelector("[data-what-matters-source]")?.textContent?.trim();
    const title = root?.querySelector(".rail-module__title")?.textContent?.trim();
    const feed = window.whatMattersFeed;
    const bodyText = root?.innerText || "";
    return { cards, empty, refreshed, refreshedAt, sourceLabel, title, feed, bodyText };
  });

  if (/what matters/i.test(audit.title || "")) pass("Module labelled What Matters", audit.title);
  else fail("Module labelled What Matters", audit.title);

  if (/live · fred \/ finnhub/i.test(audit.sourceLabel || "")) {
    pass("Source label present", audit.sourceLabel);
  } else fail("Source label present", audit.sourceLabel);

  for (const stale of STALE) {
    if (audit.bodyText.includes(stale)) fail("Static card removed", stale);
    else pass("Static card removed", stale);
  }

  for (const re of BANNED) {
    if (re.test(audit.bodyText)) fail("Banned relative wording", re.toString());
    else pass("No banned relative wording", re.toString());
  }

  if (audit.cards.length > 0) {
    pass("Live cards rendered", String(audit.cards.length));
    const allDated = audit.cards.every((c) => c.date && c.dateIso);
    if (allDated) pass("All cards have dates");
    else fail("All cards have dates", JSON.stringify(audit.cards));
    const allSourced = audit.cards.every((c) => c.source);
    if (allSourced) pass("All cards have sources");
    else fail("All cards have sources", JSON.stringify(audit.cards));
    if (audit.refreshedAt) pass("Refresh timestamp set", audit.refreshed);
    else fail("Refresh timestamp set");
  } else if (audit.empty) {
    pass("Empty state shown", audit.empty);
    if (audit.refreshedAt) pass("Refresh timestamp on empty state");
    else fail("Refresh timestamp on empty state");
  } else {
    fail("Cards or empty state", JSON.stringify(audit));
  }

  console.log("\nCards:");
  for (const c of audit.cards) {
    console.log(`  - ${c.date} | ${c.event} | ${c.source} | ${c.importance}`);
  }
  if (audit.empty) console.log(`Empty: ${audit.empty}`);
  console.log(`Refreshed: ${audit.refreshed || "—"}`);
} finally {
  await browser.close();
}

console.log(`\n--- What Matters Smoke ---\nFailed: ${failed}`);
process.exit(failed ? 1 : 0);
