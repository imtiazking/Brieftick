#!/usr/bin/env node
/**
 * Mobile briefing wheel tab smoke — Today/Why/Winners/Losers/Next on What's Moving.
 * Also sanity-checks dashboard intelligence wheel chip tap.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const OUT = path.join("reports", "mobile-wheel-tabs");

const VIEWPORTS = [
  { name: "iphone-13", ...devices["iPhone 13"] },
  { name: "samsung-s24", viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  { name: "iphone-15-pro-max", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
];

const BRIEFING_TABS = ["Today", "Why", "Winners", "Losers", "Next"];

async function bootAuthedApp(page) {
  await page.evaluate(async () => {
    window._clerkUser = { id: "wheel-smoke-user" };
    document.body.classList.add("bt-mobile-authed");
    if (window.__btLoadAppModules) await window.__btLoadAppModules();
  });
}

async function tapBriefingChip(page, label) {
  const chip = page.locator("#whmWheelViewport .intel-wheel__chip", { hasText: label });
  await chip.first().scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => ({
    badge: document.getElementById("wheelLayerBadge")?.textContent?.trim(),
    headline: document.getElementById("wheelHeadline")?.textContent?.trim(),
  }));
  const blocked = await chip.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y);
    return {
      blocked: top !== el && !el.contains(top),
      hit: top ? `${top.tagName}.${String(top.className || "").slice(0, 40)}` : null,
    };
  });
  await chip.first().click({ timeout: 12000 });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    badge: document.getElementById("wheelLayerBadge")?.textContent?.trim(),
    headline: document.getElementById("wheelHeadline")?.textContent?.trim(),
    centered: [...document.querySelectorAll("#whmWheelViewport .intel-wheel__chip.is-centered")].map(
      (c) => c.textContent?.trim()
    ),
  }));
  return {
    label,
    before,
    after,
    blocked,
    changed: before.badge !== after.badge || before.headline !== after.headline,
    centeredOk: after.centered?.includes(label),
  };
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({
    ...vp,
    viewport: vp.viewport || vp.viewportSize || { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const log = { viewport: vp.name, pageErrors: [], briefing: [], dashboard: null };

  page.on("pageerror", (e) => log.pageErrors.push(e.message));

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2500);
  await bootAuthedApp(page);
  await page.evaluate(() => window.route("why"));
  await page.waitForTimeout(8000);

  const mounted = await page.evaluate(() => ({
    route: window._activeRoute,
    chips: document.querySelectorAll("#whmWheelViewport .intel-wheel__chip").length,
    mountFn: typeof window.mountWhatsMovingBriefing,
  }));
  log.mounted = mounted;

  if (mounted.chips < 5) {
    await page.evaluate(() => window.mountWhatsMovingBriefing?.());
    await page.waitForTimeout(4000);
    log.mounted.retryChips = await page.evaluate(
      () => document.querySelectorAll("#whmWheelViewport .intel-wheel__chip").length
    );
  }

  for (const tab of BRIEFING_TABS) {
    try {
      log.briefing.push(await tapBriefingChip(page, tab));
    } catch (e) {
      log.briefing.push({ label: tab, error: e.message.split("\n")[0] });
    }
  }

  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(10000);
  await page.locator("#wheelViewport").scrollIntoViewIfNeeded();
  try {
    const dashBefore = await page.evaluate(() => ({
      centered: [...document.querySelectorAll("#wheelViewport .intel-wheel__chip.is-centered")].map((c) =>
        c.textContent?.trim()
      ),
      module: document.querySelector("#wheelModuleStage .rail-module")?.className?.slice(0, 50),
    }));
    await page.locator("#wheelViewport .intel-wheel__chip", { hasText: "Sectors" }).first().click({ timeout: 12000 });
    await page.waitForTimeout(2000);
    const dashAfter = await page.evaluate(() => ({
      centered: [...document.querySelectorAll("#wheelViewport .intel-wheel__chip.is-centered")].map((c) =>
        c.textContent?.trim()
      ),
      module: document.querySelector("#wheelModuleStage .rail-module")?.className?.slice(0, 50),
    }));
    log.dashboard = {
      before: dashBefore,
      after: dashAfter,
      changed:
        dashBefore.module !== dashAfter.module || dashAfter.centered?.includes("Sectors"),
    };
  } catch (e) {
    log.dashboard = { error: e.message.split("\n")[0] };
  }

  log.pass =
    (log.mounted.chips >= 5 || (log.mounted.retryChips ?? 0) >= 5) &&
    log.briefing.every(
      (t) =>
        !t.error &&
        t.centeredOk &&
        !t.blocked?.blocked &&
        (t.changed || t.label === "Today")
    ) &&
    log.dashboard?.changed === true &&
    !log.pageErrors.some((e) => /before initialization/i.test(e));

  await page.screenshot({ path: path.join(OUT, `wheel-${vp.name}.png`) });
  await ctx.close();
  return log;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const vp of VIEWPORTS) {
    reports.push(await runViewport(browser, vp));
  }
  await browser.close();

  const pass = reports.every((r) => r.pass);
  const out = { pass, baseUrl: BASE, reports };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
