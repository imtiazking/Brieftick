#!/usr/bin/env node
/**
 * What's Moving mobile clutter — snapshot once, per-tab focus, wheel tabs still work.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const OUT = path.join("reports", "whm-mobile-clutter");

const TABS = ["Today", "Why", "Winners", "Losers", "Next"];
const SEGMENTS = ["today", "why", "winners", "losers", "next"];

async function bootWhy(page) {
  await page.evaluate(async () => {
    window._clerkUser = { id: "whm-clutter-smoke" };
    if (window.__btLoadAppModules) await window.__btLoadAppModules();
    window.route("why");
  });
  await page.waitForTimeout(8000);
}

async function measureTab(page, label) {
  const chip = page.locator("#whmWheelViewport .intel-wheel__chip", { hasText: label });
  await chip.first().scrollIntoViewIfNeeded();
  await chip.first().click({ timeout: 12000 });
  await page.waitForTimeout(1200);
  return page.evaluate((label) => {
    const seg = document.getElementById("wheelIntelPanel")?.dataset.whmSegment;
    const snapWrap = document.getElementById("whmSnapshotWrap");
    const snapVisible = snapWrap
      ? getComputedStyle(snapWrap).display !== "none" && snapWrap.classList.contains("is-today-segment")
      : false;
    const snapRows = document.querySelectorAll(".briefing-snapshot__row").length;
    const panel = document.getElementById("wheelIntelPanel");
    const visibleSections = panel
      ? [...panel.querySelectorAll("[data-whm-section]")].filter((el) => {
          const st = getComputedStyle(el);
          return st.display !== "none" && st.visibility !== "hidden";
        }).map((el) => el.getAttribute("data-whm-section"))
      : [];
    const scrollW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;
    return {
      label,
      segment: seg,
      badge: document.getElementById("wheelLayerBadge")?.textContent?.trim(),
      snapshotWrapVisible: snapVisible,
      snapshotRowsInDom: snapRows,
      visibleSections,
      horizontalOverflow: scrollW > clientW + 2,
      pageHeight: document.getElementById("page-why")?.scrollHeight ?? 0,
    };
  }, label);
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({
    ...vp,
    viewport: vp.viewport || vp.viewportSize || { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await bootWhy(page);

  const tabs = [];
  for (const label of TABS) {
    tabs.push(await measureTab(page, label));
    await page.screenshot({
      path: path.join(OUT, `${vp.name}-${label.toLowerCase()}.png`),
      fullPage: true,
    });
  }

  // Expand snapshot on Today and verify live rows render
  await page.evaluate(() => {
    const w = document.getElementById("whmSnapshotWrap");
    if (w) w.setAttribute("open", "");
  });
  await page.waitForTimeout(1500);
  const snapshotLive = await page.evaluate(() => ({
    open: document.getElementById("whmSnapshotWrap")?.hasAttribute("open"),
    rows: document.querySelectorAll(".briefing-snapshot__row").length,
    hasLevels: [...document.querySelectorAll("[data-snapshot-level]")].some(
      (el) => (el.textContent || "").trim() && el.textContent.trim() !== "…"
    ),
  }));

  const pass =
    tabs.every((t, i) => t.segment === SEGMENTS[i] && !t.horizontalOverflow) &&
    tabs.filter((t) => t.label !== "Today").every((t) => !t.snapshotWrapVisible) &&
    tabs.find((t) => t.label === "Today")?.snapshotWrapVisible === true &&
    tabs.find((t) => t.label === "Why")?.visibleSections?.includes("happened") &&
    !tabs.find((t) => t.label === "Why")?.visibleSections?.includes("stocks") &&
    tabs.find((t) => t.label === "Winners")?.visibleSections?.includes("stocks") &&
    tabs.find((t) => t.label === "Next")?.visibleSections?.includes("watch") &&
    snapshotLive.rows >= 5;

  await ctx.close();
  return { viewport: vp.name, tabs, snapshotLive, pass };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const vp of [
    { name: "iphone-13", ...devices["iPhone 13"] },
    { name: "samsung-s24", viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    { name: "iphone-15-pro-max", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  ]) {
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
