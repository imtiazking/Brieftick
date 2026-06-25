/**
 * Verify mobile logo resize + desktop unchanged + hamburger clearance.
 * Usage: node scripts/verify-mobile-logo-resize.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:3456").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-preview", "after");
mkdirSync(outDir, { recursive: true });

const MOBILE = [
  { label: "390", width: 390, height: 844, targetW: 88, targetH: 44 },
  { label: "412", width: 412, height: 915, targetW: 90, targetH: 45 },
  { label: "430", width: 430, height: 932, targetW: 94, targetH: 47 },
];

async function boot(page, route) {
  const url = route === "about" ? `${base}/?tab=about` : `${base}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(route === "about" ? "#page-about.active" : "#page-landing.active", {
    state: "attached",
    timeout: 20000,
  });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 20000 });
  await page.evaluate(() => new Promise((resolve) => {
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!clip) return resolve();
    const finish = () => resolve();
    clip.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 2500);
  }));
}

async function metrics(page) {
  return page.evaluate(() => {
    const img = document.querySelector("#navBrand .split-brand-img--full");
    const menu = document.querySelector(".nav-a__menu-btn");
    const nav = document.getElementById("siteNav");
    const ir = img.getBoundingClientRect();
    const mr = menu?.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      width: Math.round(ir.width * 100) / 100,
      height: Math.round(ir.height * 100) / 100,
      left: Math.round(ir.left * 100) / 100,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      maxHeight: cs.maxHeight,
      maxWidth: cs.maxWidth,
      navHeight: Math.round(nr.height * 100) / 100,
      menuLeft: mr ? Math.round(mr.left * 100) / 100 : null,
      logoRight: Math.round(ir.right * 100) / 100,
      gapToMenu: mr ? Math.round((mr.left - ir.right) * 100) / 100 : null,
      src: img.getAttribute("src"),
      className: img.className,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const failures = [];
const report = { base, desktop: null, mobile: [], before: { 390: [80, 40], 412: [82.38, 41.19], 430: [86, 43] } };

// Desktop unchanged
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const route of ["landing", "about"]) {
    await boot(page, route);
    const m = await metrics(page);
    if (m.width !== 176 || m.height !== 88) {
      failures.push(`desktop ${route}: expected 176×88, got ${m.width}×${m.height}`);
    }
    if (route === "landing") {
      await page.screenshot({ path: join(outDir, "landing-desktop.png"), clip: await page.locator("#navBrand .split-brand-img--full").boundingBox() });
    }
  }
  report.desktop = { width: 176, height: 88 };
  await page.close();
}

for (const vp of MOBILE) {
  for (const route of ["landing", "about"]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await boot(page, route);
    const m = await metrics(page);
    await page.screenshot({
      path: join(outDir, `${route}-mobile-${vp.label}.png`),
      clip: await page.locator("#navBrand .split-brand-img--full").boundingBox(),
    });

    const wTol = 2;
    const hTol = 2;
    if (Math.abs(m.width - vp.targetW) > wTol || Math.abs(m.height - vp.targetH) > hTol) {
      failures.push(`${route} @${vp.label}: expected ~${vp.targetW}×${vp.targetH}, got ${m.width}×${m.height}`);
    }
    if (m.gapToMenu !== null && m.gapToMenu < 8) {
      failures.push(`${route} @${vp.label}: logo overlaps menu (gap ${m.gapToMenu}px)`);
    }
    if (m.navHeight > 64.5) {
      failures.push(`${route} @${vp.label}: nav height grew to ${m.navHeight}px (max 64)`);
    }
    if (m.objectFit !== "contain") failures.push(`${route} @${vp.label}: object-fit not contain`);
    if (route === "landing") {
      report.mobile.push({ viewport: vp.label, ...m });
    } else if (route === "about") {
      const landingEntry = report.mobile.find((e) => e.viewport === vp.label);
      if (landingEntry && (landingEntry.width !== m.width || landingEntry.height !== m.height)) {
        failures.push(`landing/about mismatch @${vp.label}`);
      }
    }
    await page.close();
  }
}

await browser.close();
writeFileSync(join(outDir, "mobile-resize-report.json"), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error("FAIL\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS", JSON.stringify(report, null, 2));
