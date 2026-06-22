/**
 * Headless browser audit for wheel-system lab (deployed or local).
 * Usage: node scripts/wheel-lab-browser-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const base =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://brieftick-c44po0bkr-imis-projects-8e15dca0.vercel.app";
const url = `${base}/design-lab/wheel-system/dashboard`;
const outDir = join(process.cwd(), "design-lab", "wheel-system", "_browser-audit");

mkdirSync(outDir, { recursive: true });

const report = {
  url,
  timestamp: new Date().toISOString(),
  httpStatus: null,
  console: [],
  network: [],
  dom: {},
  computed: {},
  errors: [],
  pass: false,
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

page.on("console", (msg) => {
  report.console.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  report.errors.push({ type: "pageerror", message: err.message });
});
page.on("requestfailed", (req) => {
  report.network.push({
    url: req.url(),
    status: "FAILED",
    failure: req.failure()?.errorText,
  });
});

const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
report.httpStatus = response?.status() ?? null;

await page.waitForTimeout(2500);

const assets = [
  "/design-lab/wheel-system/dashboard/boot.js",
  "/design-lab/wheel-system/_wheel-lab-core.js",
  "/design-lab/wheel-system/_wheel-configs.js",
  "/preview/dashboard-design-wheel.js",
  "/styles/dashboard-preview.css",
];

for (const path of assets) {
  const r = await page.evaluate(async (p) => {
    try {
      const res = await fetch(p, { cache: "no-store" });
      return { status: res.status, ok: res.ok };
    } catch (e) {
      return { status: 0, ok: false, error: String(e) };
    }
  }, path);
  report.network.push({ url: `${base}${path}`, ...r });
}

report.dom = await page.evaluate(() => {
  const panel = document.getElementById("panelWheel");
  const viewport = document.getElementById("wheelViewport");
  const chips = document.querySelectorAll(".intel-wheel__chip");
  const labels = document.querySelectorAll(".intel-wheel__chip-label");
  const chipData = Array.from(chips).map((chip, i) => {
    const label = chip.querySelector(".intel-wheel__chip-label");
    const lr = label?.getBoundingClientRect();
    const cs = label ? getComputedStyle(label) : null;
    return {
      index: i,
      id: chip.dataset.wheelId,
      centered: chip.classList.contains("is-centered"),
      labelText: label?.textContent?.trim() || "",
      labelRect: lr ? { w: lr.width, h: lr.height } : null,
      opacity: cs?.opacity,
      color: cs?.color,
      visibility: cs?.visibility,
      display: cs?.display,
      transform: cs?.transform,
    };
  });
  return {
    title: document.title,
    hasPanelWheel: !!panel,
    panelWheelId: panel?.id || null,
    bodyClasses: document.body.className,
    viewportChildCount: viewport?.children.length ?? 0,
    trackExists: !!viewport?.querySelector(".intel-wheel__track"),
    focusExists: !!viewport?.querySelector(".intel-wheel__focus"),
    chipCount: chips.length,
    labelCount: labels.length,
    chipLabels: chipData.map((c) => c.labelText),
    hasGlobe: !!document.querySelector(".wheel-globe"),
    hasIntelPanel: !!document.querySelector(".intel-panel"),
    headline: document.getElementById("wheelHeadline")?.textContent || "",
    sectorCards: document.querySelectorAll(".intel-data-card").length,
    layerBadge: document.getElementById("wheelLayerBadge")?.textContent || "",
    debugPanel: document.getElementById("wheelLabDebug")?.textContent?.slice(0, 500) || "",
  };
});

report.computed = await page.evaluate(() => {
  const vp = document.querySelector(".intel-wheel__viewport");
  const vcs = vp ? getComputedStyle(vp) : null;
  const scene = document.querySelector(".intel-wheel-scene");
  const scs = scene ? getComputedStyle(scene) : null;
  const engine = document.getElementById("wheelEngine");
  const ecs = engine ? getComputedStyle(engine) : null;
  return {
    viewport: vcs
      ? {
          height: vcs.height,
          overflow: vcs.overflow,
          opacity: vcs.opacity,
          zIndex: vcs.zIndex,
          maskImage: vcs.maskImage?.slice?.(0, 40),
        }
      : null,
    scene: scs ? { display: scs.display, zIndex: scs.zIndex, gridTemplateRows: scs.gridTemplateRows } : null,
    engine: ecs
      ? { display: ecs.display, opacity: ecs.opacity, visibility: ecs.visibility, height: ecs.height }
      : null,
  };
});

const shotPath = join(outDir, "dashboard-deployed.png");
await page.screenshot({ path: shotPath, fullPage: true });

report.pass =
  report.httpStatus === 200 &&
  report.dom.hasPanelWheel &&
  report.dom.chipCount >= 5 &&
  !report.dom.hasGlobe &&
  report.dom.hasIntelPanel &&
  report.dom.sectorCards >= 2 &&
  report.errors.length === 0;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("\nScreenshot:", shotPath);
console.log("\nPASS:", report.pass);

await browser.close();
process.exit(report.pass ? 0 : 1);
