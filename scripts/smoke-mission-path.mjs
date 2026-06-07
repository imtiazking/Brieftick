import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const errors = [];

async function runDesktop() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://127.0.0.1:3458/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.MissionPathController, { timeout: 30000 });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    localStorage.removeItem("brieftick_mission_path_v1");
    const user = { id: "qa_user_mp2", publicMetadata: {} };
    window._clerkUser = user;
    window.MissionPathController.onAuthReady(user);
  });
  await page.waitForTimeout(1000);

  const welcome = {
    step: await page.textContent(".mp-welcome .mp-progress-head__step"),
    time: await page.textContent(".mp-welcome .mp-progress-head__time"),
  };
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(800);

  const m1 = {
    meta: await page.textContent(".mp-progress-head__step"),
    title: await page.textContent(".mp-progress-head__title"),
  };

  await page.click('[data-mp-check="volatility"]');
  await page.waitForTimeout(300);
  const checked = await page
    .locator('[data-mp-check="volatility"]')
    .evaluate((el) => el.classList.contains("is-checked"));

  await page.click("[data-mp-minimize]");
  const pill = await page.isVisible("[data-mp-pill]");
  await page.click("[data-mp-pill]");
  await page.waitForTimeout(200);

  for (let i = 0; i < 6; i++) {
    await page.click("[data-mp-verify]");
    await page.waitForTimeout(300);
  }

  const done = await page.evaluate(() => {
    const raw = localStorage.getItem("brieftick_mission_path_v1");
    const u = JSON.parse(raw || "{}").users?.qa_user_mp2;
    return {
      title: document.querySelector(".mp-complete__title")?.textContent,
      status: u?.status,
      xp: u?.xp,
    };
  });

  await page.click("[data-mp-enter]");
  await page.waitForTimeout(200);
  const rootHidden = await page.locator("[data-mp-root]").isHidden();

  await page.close();
  return { welcome, m1, checked, pill, done, rootHidden };
}

async function runMobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:3458/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.MissionPathController);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    localStorage.removeItem("brieftick_mission_path_v1");
    const user = { id: "qa_mobile", publicMetadata: {} };
    window.MissionPathController.onAuthReady(user);
  });
  await page.waitForTimeout(1000);
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(500);
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector(".mp-panel");
    const st = panel ? getComputedStyle(panel) : null;
    return {
      bottom: st?.bottom,
      maxHeight: st?.maxHeight,
      meta: document.querySelector(".mp-progress-head__step")?.textContent,
    };
  });
  await page.close();
  return mobile;
}

const desktop = await runDesktop();
const mobile = await runMobile();
await browser.close();

console.log(JSON.stringify({ errors, desktop, mobile }, null, 2));

const ok =
  desktop.welcome?.time?.includes("~10 min") &&
  desktop.welcome?.step?.includes("Mission 1 of 6") &&
  desktop.m1.meta?.includes("Mission 1 of 6") &&
  desktop.m1.title === "Read the Market" &&
  desktop.checked &&
  desktop.pill &&
  desktop.done.status === "completed" &&
  desktop.done.xp === 325 &&
  desktop.rootHidden;

process.exit(ok ? 0 : 1);
