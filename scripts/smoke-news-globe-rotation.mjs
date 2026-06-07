import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = {};

async function openDashboardNews(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.route("dashboard"));
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    try {
      const mod = await import("/preview/dashboard-wheel-core.js");
      mod.selectWheelModule("news");
    } catch {
      const chips = document.querySelectorAll("#page-dashboard .intel-wheel__chip");
      for (const chip of chips) {
        if (/news/i.test(chip.textContent || "")) chip.click();
      }
    }
  });
  await page.waitForFunction(
    () => {
      const visual = document.querySelector(".news-narrative__visual");
      return visual?.dataset?.globeBound === "true" && visual?._globeCanvas?.layers?.globe;
    },
    { timeout: 60000 }
  );
  await page.waitForTimeout(800);
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openDashboardNews(page);

  const sampleRotation = async () =>
    page.evaluate(() => {
      const visual = document.querySelector('.news-narrative__visual[data-globe-bound="true"]');
      const api = visual?._globeCanvas;
      const layers = api?.layers;
      if (!layers?.globe) return null;
      return {
        yaw: layers.globe.rotation.y,
        enabled: layers.idleRotationEnabled,
        paused: layers.idleRotationPaused,
        speed: layers.idleRotationSpeed,
      };
    });

  const a = await sampleRotation();
  await page.waitForTimeout(1600);
  const b = await sampleRotation();

  checks.globeBound = Boolean(a);
  checks.idleRotationEnabled = a?.enabled === true;
  checks.idleRotationSpeed = a?.speed;
  checks.yawDrifted = a != null && b != null && Math.abs(b.yaw - a.yaw) > 0.01;

  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
  const c = await sampleRotation();
  await page.hover(".news-narrative__visual");
  await page.waitForTimeout(300);
  const hovered = await sampleRotation();
  checks.pausesOnHover = hovered?.paused === true;

  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
  const afterLeave = await sampleRotation();
  checks.resumesAfterLeave = afterLeave?.paused === false;

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  const reduced = await sampleRotation();
  checks.reducedMotionDisables = reduced?.enabled === false;

  await page.close();
}

await browser.close();

const pass =
  errors.length === 0 &&
  checks.globeBound &&
  checks.idleRotationEnabled &&
  checks.yawDrifted &&
  checks.pausesOnHover &&
  checks.resumesAfterLeave &&
  checks.reducedMotionDisables;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
