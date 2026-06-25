#!/usr/bin/env node
/**
 * Money Flow mobile UX — bubble tap targets, bottom sheet, no horizontal scroll.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = path.join("reports", "flow-mobile");
const IS_PROD = /^(www\.)?(forgeniq|brieftick)\.com$/i.test(new URL(BASE).hostname);

const BUBBLE_IDS = ["technology", "energy", "financials", "industrials", "defensives"];

async function bootDashboard(page) {
  const entry = IS_PROD ? BASE + "/" : BASE + "/?qa=1";
  await page.goto(entry, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => typeof window.route === "function", { timeout: 60000 });
  await page.evaluate(async () => {
    window._clerkUser = { id: "flow-mobile-smoke" };
    window.btQaSaveRoute?.("dashboard");
    if (window.__btLoadAppModules) await window.__btLoadAppModules();
    window.route("dashboard");
  });
  await page.waitForSelector("#page-dashboard.active", { timeout: 30000 });
  await page.waitForTimeout(3000);
}

async function openFlows(page) {
  const chips = page.locator("#page-dashboard .intel-wheel__chip");
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    const t = (await chips.nth(i).textContent()) || "";
    if (/flow/i.test(t)) {
      await chips.nth(i).click();
      await page.waitForSelector(".flow-bubbles-hero", { timeout: 20000 });
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

async function measureBubbles(page) {
  return page.evaluate((ids) => {
    const map = document.querySelector(".flow-bubbles-hero.is-mobile");
    const cluster = map?.querySelector(".flow-bubbles-hero__cluster");
    const bubbles = [...document.querySelectorAll(".flow-bubble[data-flow-id]")];
    const scrollW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;

    const positions = bubbles.map((b) => {
      const r = b.getBoundingClientRect();
      const hit = Math.max(r.width, r.height);
      const cs = getComputedStyle(b);
      const before = b;
      return {
        id: b.dataset.flowId,
        w: r.width,
        h: r.height,
        hitMin: Math.max(r.width, r.height),
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        minHitOk: hit >= 42,
      };
    });

    let overlapBlocksTap = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const minSep = (a.w + b.w) / 2 * 0.55;
        if (dist < minSep * 0.35) overlapBlocksTap = true;
      }
    }

    return {
      isMobile: !!map,
      layoutSettled: cluster?.classList.contains("is-layout-settled"),
      bubbleCount: bubbles.length,
      allIdsPresent: ids.every((id) => bubbles.some((b) => b.dataset.flowId === id)),
      minHitOk: positions.every((p) => p.minHitOk),
      overlapBlocksTap,
      horizontalOverflow: scrollW > clientW + 2,
      positions,
    };
  }, BUBBLE_IDS);
}

async function tapBubble(page, id) {
  const bubble = page.locator(`.flow-bubble[data-flow-id="${id}"]`);
  await bubble.click({ timeout: 8000 });
  await page.waitForTimeout(600);
  return page.evaluate((id) => {
    const map = document.querySelector(".flow-bubbles-hero");
    const detail = document.querySelector("[data-flow-detail]");
    const focused = document.querySelector(`.flow-bubble[data-flow-id="${id}"].is-focused`);
    const cta = document.querySelector("[data-flow-analysis]");
    const net = document.querySelector(".flow-bubbles-hero__detail-net-val");
    return {
      id,
      hasFocus: !!focused,
      detailOpen: detail && !detail.hidden,
      hasCta: !!cta,
      netFlow: net?.textContent?.trim() || null,
      title: document.querySelector(".flow-bubbles-hero__detail-title")?.textContent?.trim(),
    };
  }, id);
}

async function runViewport(browser, vp, consoleErrors) {
  const ctx = await browser.newContext({
    ...vp,
    viewport: vp.viewport || vp.viewportSize || { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/favicon|404.*\.(png|ico)|clerk|third-party|CORS policy/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  await bootDashboard(page);
  const opened = await openFlows(page);
  const before = await measureBubbles(page);
  await page.screenshot({
    path: path.join(OUT, `${vp.name}-before.png`),
    fullPage: false,
  });

  const taps = [];
  for (const id of BUBBLE_IDS) {
    taps.push(await tapBubble(page, id));
    await page.screenshot({
      path: path.join(OUT, `${vp.name}-${id}.png`),
      fullPage: false,
    });
    await page.locator("[data-flow-detail-close]").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  const pass =
    opened &&
    before.isMobile &&
    before.layoutSettled &&
    before.bubbleCount === 5 &&
    before.allIdsPresent &&
    before.minHitOk &&
    !before.overlapBlocksTap &&
    !before.horizontalOverflow &&
    taps.every((t) => t.hasFocus && t.detailOpen && t.hasCta && t.netFlow);

  await ctx.close();
  return { viewport: vp.name, opened, before, taps, pass };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const vp of [
    { name: "iphone-13", ...devices["iPhone 13"] },
    { name: "samsung-s24", viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    { name: "iphone-15-pro-max", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  ]) {
    reports.push(await runViewport(browser, vp, consoleErrors));
  }

  // Desktop unchanged — no is-mobile class
  const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const deskPage = await deskCtx.newPage();
  deskPage.on("pageerror", (e) => consoleErrors.push(e.message));
  await bootDashboard(deskPage);
  const dashboardLoads = await deskPage.evaluate(() => ({
    active: document.querySelector("#page-dashboard")?.classList.contains("active"),
    wheel: !!document.querySelector("#wheelViewport"),
    legacyHidden: document.getElementById("dashLegacyFallback")?.hidden !== false,
  }));
  await openFlows(deskPage);
  const desktopOk = await deskPage.evaluate(() => ({
    notMobile: !document.querySelector(".flow-bubbles-hero.is-mobile"),
    bubbleCount: document.querySelectorAll(".flow-bubble").length,
    hasHoverSpread: typeof document.querySelector(".flow-bubbles-hero") !== "undefined",
  }));
  await deskCtx.close();
  await browser.close();

  const pass =
    reports.every((r) => r.pass) &&
    dashboardLoads.active &&
    dashboardLoads.wheel &&
    desktopOk.notMobile &&
    desktopOk.bubbleCount === 5 &&
    consoleErrors.length === 0;
  const out = { pass, baseUrl: BASE, dashboardLoads, desktopOk, consoleErrors: consoleErrors.slice(0, 8), reports };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
