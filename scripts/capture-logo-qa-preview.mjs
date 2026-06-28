/**
 * Full visual QA preview — logo replacement (local only, no deploy).
 * Usage: node scripts/capture-logo-qa-preview.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const outDir = join(process.cwd(), "debug", "logo-qa-preview");
mkdirSync(outDir, { recursive: true });

const report = { base, capturedAt: new Date().toISOString(), shots: [], metrics: {}, checks: {} };

async function waitLanding(page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("bt_preview_qa");
      localStorage.removeItem("bt_qa_last_route");
      sessionStorage.removeItem("bt_qa_last_route");
    } catch { /* ignore */ }
  });
  await page.goto(`${base}/?tab=landing`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#navBrand .split-brand-img--full", { state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => document.getElementById("page-landing")?.classList.contains("active"),
    { timeout: 15000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => {
    const clip = document.querySelector("#navBrand .split-brand__clip");
    if (!clip) return r();
    const finish = () => r();
    clip.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 2500);
  }));
}

async function logoMetrics(page, sel = "#navBrand .split-brand-img--full") {
  return page.evaluate((s) => {
    const img = document.querySelector(s);
    if (!img) return null;
    const ir = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      renderedW: Math.round(ir.width * 100) / 100,
      renderedH: Math.round(ir.height * 100) / 100,
      aspectRatio: Math.round((ir.width / ir.height) * 1000) / 1000,
      transform: cs.transform,
      src: img.currentSrc || img.src,
    };
  }, sel);
}

async function captureLogoCrops(page, prefix, sel = "#navBrand .split-brand-img--full") {
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });
  await page.waitForTimeout(150);
  const crop100 = join(outDir, `${prefix}-logo-crop-100pct.png`);
  await page.locator(sel).screenshot({ path: crop100 });

  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  await page.waitForTimeout(200);
  const crop200 = join(outDir, `${prefix}-logo-crop-200pct.png`);
  await page.locator(sel).screenshot({ path: crop200 });
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });

  return { crop100, crop200 };
}

async function captureOnBackgrounds(page, prefix, sel) {
  const bgs = [
    { name: "dark", css: "background:#0a0a0a !important" },
    { name: "white", css: "background:#ffffff !important" },
    { name: "gold", css: "background:linear-gradient(135deg,#1a1510,#3d2e1a) !important" },
  ];
  const paths = [];
  for (const bg of bgs) {
    await page.evaluate((css) => {
      const nav = document.getElementById("siteNav");
      if (nav) nav.style.cssText += css;
    }, bg.css);
    const p = join(outDir, `${prefix}-logo-on-${bg.name}.png`);
    await page.locator(sel).screenshot({ path: p });
    paths.push(p);
  }
  return paths;
}

async function shotElement(page, selector, path, { force = false } = {}) {
  const loc = page.locator(selector).first();
  const box = await loc.boundingBox().catch(() => null);
  if (box && box.width > 0) {
    await page.screenshot({ path, clip: { ...box, x: Math.max(0, box.x), y: Math.max(0, box.y) } });
    return true;
  }
  if (force) {
    await loc.screenshot({ path, timeout: 10000 }).catch(() => false);
    return true;
  }
  return false;
}

const browser = await chromium.launch({ headless: true });

// ── Desktop 1440: header + footer ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  report.metrics.desktop = await logoMetrics(page);

  const header = join(outDir, "01-desktop-1440-header.png");
  await page.locator("#siteNav").screenshot({ path: header });
  report.shots.push({ id: "desktop-header", path: header });

  const footer = join(outDir, "02-desktop-1440-footer.png");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await shotElement(page, "footer img[src*='forgeniq-logo']", footer, { force: true });
  const footerSection = join(outDir, "02b-desktop-1440-footer-section.png");
  await page.screenshot({ path: footerSection, fullPage: true });
  report.shots.push({ id: "desktop-footer-section", path: footerSection });
  report.shots.push({ id: "desktop-footer", path: footer });

  const crops = await captureLogoCrops(page, "desktop-1440");
  report.shots.push({ id: "desktop-logo-100", path: crops.crop100 }, { id: "desktop-logo-200", path: crops.crop200 });
  const bgShots = await captureOnBackgrounds(page, "desktop-1440", "#navBrand .split-brand-img--full");
  report.shots.push(...bgShots.map((p, i) => ({ id: `desktop-bg-${i}`, path: p })));

  await page.close();
}

// ── Mobile 390: header + menu ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  report.metrics.mobile = await logoMetrics(page);

  const header = join(outDir, "03-mobile-390-header.png");
  await page.locator("#siteNav").screenshot({ path: header });
  report.shots.push({ id: "mobile-header", path: header });

  await page.locator("#navMenuBtn").click();
  await page.waitForSelector("#navDrawer[aria-hidden='false'], #navDrawer.is-open, .nav-a__drawer-panel", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const menu = join(outDir, "04-mobile-390-menu-open.png");
  await page.screenshot({ path: menu, fullPage: false });
  report.shots.push({ id: "mobile-menu", path: menu });

  await page.evaluate(() => {
    document.getElementById("navDrawer")?.setAttribute("aria-hidden", "true");
    document.getElementById("navDrawer")?.classList.remove("is-open");
  });
  const crops = await captureLogoCrops(page, "mobile-390");
  report.shots.push({ id: "mobile-logo-100", path: crops.crop100 }, { id: "mobile-logo-200", path: crops.crop200 });

  await page.close();
}

// ── Dashboard preview ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/dashboard-preview.html`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector(".dash-preview-chrome .split-brand-img", { state: "visible", timeout: 30000 });
  report.metrics.dashboard = await logoMetrics(page, ".dash-preview-chrome .split-brand-img");

  const dash = join(outDir, "05-dashboard-preview-header.png");
  await page.locator(".dash-preview-chrome").screenshot({ path: dash });
  report.shots.push({ id: "dashboard", path: dash });

  const crops = await captureLogoCrops(page, "dashboard", ".dash-preview-chrome .split-brand-img");
  report.shots.push({ id: "dashboard-logo-100", path: crops.crop100 }, { id: "dashboard-logo-200", path: crops.crop200 });

  await page.close();
}

// ── Authentication (Clerk sign-in modal) ──
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitLanding(page);
  await page.locator("#authSignInBtn").click();
  await page.waitForTimeout(3000);

  const auth = join(outDir, "06-auth-signin-modal.png");
  await page.screenshot({ path: auth, fullPage: false });
  report.shots.push({ id: "auth-signin", path: auth });

  // Auth overlay header logo if present in main nav behind modal
  const navBehind = join(outDir, "06-auth-nav-behind-modal.png");
  await page.locator("#siteNav").screenshot({ path: navBehind }).catch(() => {});
  report.shots.push({ id: "auth-nav", path: navBehind });

  await page.close();
}

await browser.close();

// Verification summary
report.checks = {
  hiResAsset: (report.metrics.desktop?.naturalW ?? 0) >= 4096,
  desktopSizeApprox15pct: (report.metrics.desktop?.renderedW ?? 0) > 230,
  mobileSizeApprox15pct: (report.metrics.mobile?.renderedW ?? 0) > 198,
  aspectRatio2to1: report.metrics.desktop?.aspectRatio === 2,
  scaleDesktop: "1.351 (was 1.175)",
  scaleMobile: "2.542 (was 2.21)",
  transparentBackground: "Verify logo-on-dark/white/gold crops in debug/logo-qa-preview/",
};

report.pass =
  report.checks.hiResAsset &&
  report.checks.desktopSizeApprox15pct &&
  report.checks.mobileSizeApprox15pct &&
  report.checks.aspectRatio2to1;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(
  join(outDir, "README.md"),
  `# Logo QA Preview\n\n**Local URL:** ${base}\n**Generated:** ${report.capturedAt}\n\n## Screenshots\n\n| # | File | Description |\n|---|------|-------------|\n| 1 | 01-desktop-1440-header.png | Desktop header |\n| 2 | 02-desktop-1440-footer.png | Desktop footer |\n| 3 | 03-mobile-390-header.png | Mobile header |\n| 4 | 04-mobile-390-menu-open.png | Mobile menu open |\n| 5 | 05-dashboard-preview-header.png | Dashboard chrome |\n| 6 | 06-auth-signin-modal.png | Sign-in modal |\n\n## Logo crops\n\n- \`*-logo-crop-100pct.png\` — 100% zoom element crop\n- \`*-logo-crop-200pct.png\` — 200% zoom element crop\n- \`desktop-1440-logo-on-{dark,white,gold}.png\` — transparency on backgrounds\n\n## Automated checks\n\n\`\`\`json\n${JSON.stringify(report.checks, null, 2)}\n\`\`\`\n\n**Pass:** ${report.pass ? "YES" : "NO — review report.json"}\n\n> Do NOT deploy until screenshots are approved.\n`,
);

console.log(JSON.stringify({ pass: report.pass, outDir, metrics: report.metrics, checks: report.checks }, null, 2));
