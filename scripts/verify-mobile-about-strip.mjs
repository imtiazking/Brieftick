/**
 * Verify mobile About top strip fix + regression checks.
 * Usage: node scripts/verify-mobile-about-strip.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const out = join(process.cwd(), "debug", "mobile-about-strip", "after");
mkdirSync(out, { recursive: true });

const widths = [390, 412, 430];
const failures = [];

async function aboutMetrics(page) {
  return page.evaluate(() => {
    const bg = document.querySelector("#splitAboutMount .cw-mobile-bg");
    const mount = document.querySelector("#splitAboutMount");
    const main = document.querySelector("main");
    const br = bg?.getBoundingClientRect();
    const cs = bg ? getComputedStyle(bg) : null;
    const sample = (y) => {
      const el = document.elementFromPoint(30, y);
      return {
        y,
        tag: el?.tagName,
        id: el?.id || null,
        class: (el?.className || "").toString().slice(0, 40) || null,
      };
    };
    const hasAtmosphereAtTop = bg ? bg.getBoundingClientRect().top === 0 && getComputedStyle(bg).position === "fixed" : false;
    return {
      mainPaddingTop: main ? getComputedStyle(main).paddingTop : null,
      bgTop: br ? Math.round(br.top * 10) / 10 : null,
      bgPosition: cs?.position,
      bgInset: cs ? `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}` : null,
      mountTop: mount ? Math.round(mount.getBoundingClientRect().top * 10) / 10 : null,
      samples: [sample(1), sample(20), sample(70)],
      hasAtmosphereAtTop,
      scrollHeight: document.documentElement.scrollHeight,
      overflowX: getComputedStyle(document.body).overflowX,
    };
  });
}

const browser = await chromium.launch({ headless: true });

for (const w of widths) {
  const page = await browser.newPage({ viewport: { width: w, height: 844 } });
  await page.goto(`${base}/?tab=about`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#page-about.active", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const m = await aboutMetrics(page);
  await page.screenshot({ path: join(out, `about-top-strip-${w}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
  await page.screenshot({ path: join(out, `about-full-${w}.png`), fullPage: false });

  if (m.bgTop !== 0) failures.push(`about@${w}: cw-mobile-bg top=${m.bgTop}, expected 0`);
  if (m.bgPosition !== "fixed") failures.push(`about@${w}: cw-mobile-bg position=${m.bgPosition}`);
  if (m.mainPaddingTop !== "0px") failures.push(`about@${w}: main padding-top=${m.mainPaddingTop}`);
  if (!m.hasAtmosphereAtTop) failures.push(`about@${w}: cw-mobile-bg not fixed at top`);
  if (m.scrollHeight < 900) failures.push(`about@${w}: page too short to scroll (${m.scrollHeight})`);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);
  const scrollOk = await page.evaluate(() => window.scrollY > 100);
  if (!scrollOk) failures.push(`about@${w}: scroll blocked`);

  console.log(`about ${w}px`, m);
  await page.close();
}

// Landing regression + scroll
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const landingBg = await page.evaluate(() => {
    const bg = document.querySelector(".cw-mobile-bg");
    const r = bg?.getBoundingClientRect();
    return { top: r?.top, position: bg ? getComputedStyle(bg).position : null, scrollHeight: document.documentElement.scrollHeight };
  });
  await page.screenshot({ path: join(out, "landing-top-strip-390.png"), clip: { x: 0, y: 0, width: 390, height: 90 } });
  if (landingBg.top !== 0) failures.push(`landing@390: cw-mobile-bg top=${landingBg.top}`);
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  const landingScroll = await page.evaluate(() => window.scrollY > 100);
  if (!landingScroll) failures.push("landing@390: scroll blocked");
  await page.close();
}

// Pricing regression
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/?tab=pricing`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const pricing = await page.evaluate(() => ({
    active: document.getElementById("page-pricing")?.classList.contains("active"),
    h1: document.querySelector("#page-pricing h1")?.textContent?.slice(0, 40),
  }));
  await page.screenshot({ path: join(out, "pricing-top-390.png"), clip: { x: 0, y: 0, width: 390, height: 90 } });
  if (!pricing.active) failures.push("pricing@390: page not active");
  await page.close();
}

// CTA tap check on About (Start Free + Sign In via drawer)
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/?tab=about`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  const clerkReady = await page.evaluate(() => !!window.__btClerkInitialized);
  const signup = page.locator(".nav-a__end .auth-signup-btn").first();
  if (await signup.isVisible()) {
    await signup.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    const modal = await page.evaluate(() => {
      const el = document.querySelector(".cl-modalBackdrop, .cl-modalContent, .cl-rootBox, [class*='cl-modal']");
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden";
    });
    if (clerkReady && !modal) failures.push("about@390: Start Free did not open auth");
  }
  await page.goto(`${base}/?tab=about`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);
  const signIn = page.locator("#navDrawerLinks .auth-signin-btn, .nav-drawer-signin").first();
  if (await signIn.isVisible()) {
    await signIn.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    const signInModal = await page.evaluate(() => {
      const el = document.querySelector(".cl-modalBackdrop, .cl-modalContent, .cl-rootBox, [class*='cl-modal']");
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden";
    });
    if (clerkReady && !signInModal) failures.push("about@390: Sign In did not open auth");
  }
  await page.screenshot({ path: join(out, "about-cta-390.png") });
  await page.close();
}

// Desktop unchanged
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?tab=about`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const d = await page.evaluate(() => {
    const bg = document.querySelector("#splitAboutMount .cw-mobile-bg");
    const mount = document.querySelector("#splitAboutMount");
    return {
      hasMobileBg: !!bg,
      mountPosition: mount ? getComputedStyle(mount).position : null,
      mainPad: getComputedStyle(document.querySelector("main")).paddingTop,
    };
  });
  await page.screenshot({ path: join(out, "about-desktop-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 120 } });
  if (d.hasMobileBg) failures.push("desktop: cw-mobile-bg should not mount");
  if (d.mountPosition !== "fixed") failures.push(`desktop: splitAboutMount position=${d.mountPosition}`);
  await page.close();
}

await browser.close();

const report = { base, pass: failures.length === 0, failures };
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error("FAIL\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS", report);
