#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const OUT = join(ROOT, "reports", "about-typography", "prod");
mkdirSync(OUT, { recursive: true });

function clerkModal(page) {
  return page.evaluate(() => {
    const el = document.querySelector(
      ".cl-modalBackdrop,.cl-modalContent,[class*='cl-modal']"
    );
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  });
}

async function goAbout(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    window.route("about");
    window.BrieftickSplitLanding?.onSplitRoute?.("about");
  });
  await page.waitForTimeout(2500);
}

async function waitForDeploy() {
  for (let i = 1; i <= 20; i++) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.route("about"));
    await page.waitForTimeout(1500);
    const live = await page.evaluate(() => !!document.querySelector(".about-stat-kicker"));
    await browser.close();
    if (live) return true;
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

async function verifyViewport(vp) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(vp);
  await goAbout(page);

  const metrics = await page.evaluate(() => {
    const pageEl = document.getElementById("page-about");
    const text = pageEl?.innerText || "";
    const dashes = text.match(/[—–·]/g) || [];
    const cta = document.querySelector(".about-hero-cta__btn");
    const ctaRect = cta?.getBoundingClientRect();
    window.scrollTo(0, 2000);
    return {
      dashCount: dashes.length,
      dashes,
      docH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      scrollY: window.scrollY,
      scrollWorks: window.scrollY > 100,
      horizontalScroll:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
        window.innerWidth + 2,
      ctaAboveFold: ctaRect ? ctaRect.top < window.innerHeight : null,
      ctaTop: ctaRect ? Math.round(ctaRect.top) : null,
      hasStatKicker: !!document.querySelector(".about-stat-kicker"),
      heroShort: document.querySelector(".about-hero-desc--short")?.textContent?.trim(),
    };
  });

  await page.screenshot({ path: join(OUT, `mobile-${vp.width}.png`), fullPage: false });
  await browser.close();
  return { viewport: vp.width, metrics, errors };
}

async function verifyDesktop() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await goAbout(page);

  const metrics = await page.evaluate(() => {
    const text = document.getElementById("page-about")?.innerText || "";
    const dashes = text.match(/[—–·]/g) || [];
    return {
      dashCount: dashes.length,
      dashes,
      principles: document.querySelectorAll(".about-principle").length,
      statRow: getComputedStyle(document.querySelector(".about-stat-row")).gridTemplateColumns,
      sectionLabels: document.querySelectorAll(".about-section-label").length,
      hudText: document.querySelector(".cw-hud")?.textContent?.trim() || null,
    };
  });

  await page.screenshot({ path: join(OUT, "desktop.png"), fullPage: true });

  await page.click(".about-cta-box .btn-primary");
  await page.waitForTimeout(3500);
  const startFreeModal = await clerkModal(page);

  await goAbout(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await goAbout(page);
  await page.click(".about-hero-cta__btn");
  await page.waitForTimeout(3500);
  const mobileStartFree = await clerkModal(page);

  await goAbout(page);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  const signIn = await page.$("#navDrawerAuth .auth-signin-btn");
  let signInModal = false;
  if (signIn) {
    await signIn.click();
    await page.waitForTimeout(3500);
    signInModal = await clerkModal(page);
  }

  await browser.close();
  return { metrics, startFreeModal, mobileStartFree, signInModal, errors };
}

const deployed = await waitForDeploy();
if (!deployed) {
  console.error("DEPLOY_TIMEOUT");
  process.exit(1);
}

const mobile = [];
for (const w of [390, 412, 430]) {
  mobile.push(await verifyViewport({ width: w, height: 844 }));
}
const desktop = await verifyDesktop();

const report = {
  commit: "1c141a3",
  baseUrl: BASE,
  deployed: true,
  screenshots: {
    desktop: join(OUT, "desktop.png").replace(/\\/g, "/"),
    mobile390: join(OUT, "mobile-390.png").replace(/\\/g, "/"),
    mobile412: join(OUT, "mobile-412.png").replace(/\\/g, "/"),
    mobile430: join(OUT, "mobile-430.png").replace(/\\/g, "/"),
  },
  desktop,
  mobile,
  pass:
    desktop.metrics.dashCount === 0 &&
    mobile.every((m) => m.metrics.dashCount === 0) &&
    mobile.every((m) => m.metrics.scrollWorks) &&
    mobile.every((m) => m.metrics.ctaAboveFold) &&
    mobile.every((m) => !m.metrics.horizontalScroll) &&
    desktop.startFreeModal &&
    desktop.mobileStartFree &&
    desktop.signInModal,
};

writeFileSync(join(OUT, "verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
