import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const results = { base: BASE, checks: {}, errors: [] };

async function setupUser(page, userId, meta = {}) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.MissionPathController, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(
    ({ userId, meta }) => {
      localStorage.removeItem("brieftick_mission_path_v1");
      const user = { id: userId, publicMetadata: meta };
      window._clerkUser = user;
      window.MissionPathController.onAuthReady(user);
    },
    { userId, meta }
  );
  await page.waitForTimeout(1000);
}

// 1. Admin auto-launch disabled
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => results.errors.push(e.message));
  await setupUser(page, "admin_qa", { role: "admin" });
  const admin = await page.evaluate(() => ({
    welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
    rootHidden: document.querySelector("[data-mp-root]")?.hidden,
    pillHidden: document.querySelector("[data-mp-pill]")?.hidden,
    store: localStorage.getItem("brieftick_mission_path_v1"),
  }));
  results.checks.adminNoAutoLaunch =
    admin.welcomeHidden !== false && (admin.rootHidden === true || admin.pillHidden !== false);
  await page.close();
}

// 2. ?mission=restart
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + "/?mission=restart", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.MissionPathController);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    localStorage.removeItem("brieftick_mission_path_v1");
    window._clerkUser = { id: "restart_qa", publicMetadata: {} };
    window.MissionPathController.onAuthReady(window._clerkUser);
  });
  await page.waitForTimeout(1000);
  const restart = await page.evaluate(() => ({
    welcomeVisible: !document.querySelector("[data-mp-welcome]")?.hidden,
    title: document.querySelector(".mp-welcome__title")?.textContent,
    store: !!localStorage.getItem("brieftick_mission_path_v1"),
  }));
  results.checks.missionRestart = restart.welcomeVisible && restart.title?.includes("workflow");
  await page.close();
}

// 3. Settings Continue / Restart / Reset
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setupUser(page, "settings_qa", {});
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(600);
  await page.click("[data-mp-minimize]");
  await page.waitForTimeout(300);

  await page.evaluate(() => window.MissionPathController.syncSettingsUI());
  const statusMid = await page.textContent("#missionPathStatus");

  await page.evaluate(() => {
    document.getElementById("missionPathContinue")?.click();
  });
  await page.waitForTimeout(400);
  const resumed = await page.evaluate(() => !document.querySelector("[data-mp-panel]")?.hidden);

  await page.evaluate(() => {
    window.MissionPathController.resetProgressOnly();
  });
  const afterReset = await page.evaluate(() => ({
    store: localStorage.getItem("brieftick_mission_path_v1"),
    status: document.getElementById("missionPathStatus")?.textContent,
  }));

  results.checks.settings = {
    statusMid: statusMid?.includes("Mission"),
    resumed,
    afterResetEmpty: !afterReset.store?.includes("settings_qa"),
    statusAfterReset: afterReset.status === "Not started",
  };
  await page.close();
}

// 4. onboardBanner removed + localStorage lifecycle
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setupUser(page, "storage_qa", {});
  const banner = await page.evaluate(() => ({
    bannerEl: !!document.getElementById("onboardBanner"),
    missionRoot: !!document.getElementById("missionPathRoot"),
  }));
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(400);
  const afterBegin = await page.evaluate(() => {
    const raw = localStorage.getItem("brieftick_mission_path_v1");
    const u = JSON.parse(raw || "{}").users?.storage_qa;
    return { hasKey: !!raw, status: u?.status, mission: u?.currentMission };
  });
  for (let i = 0; i < 6; i++) {
    await page.click("[data-mp-verify]");
    await page.waitForTimeout(250);
  }
  const afterComplete = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users?.storage_qa;
    return { status: u?.status, xp: u?.xp, completedAt: u?.completedAt };
  });
  results.checks.onboardBannerRemoved = !banner.bannerEl && banner.missionRoot;
  results.checks.localStorage = { afterBegin, afterComplete };
  await page.close();
}

// 5. Skip persists — never auto-launches again
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setupUser(page, "skip_qa", {});
  await page.click("[data-mp-skip]");
  await page.waitForTimeout(400);
  const afterSkip = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users?.skip_qa;
    return {
      status: u?.status,
      rootHidden: document.querySelector("[data-mp-root]")?.hidden,
      welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
      pillHidden: document.querySelector("[data-mp-pill]")?.hidden,
    };
  });
  await page.evaluate(() => {
    window.MissionPathController.onAuthReady(window._clerkUser);
  });
  await page.waitForTimeout(1200);
  const afterRelaunch = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users?.skip_qa;
    return {
      status: u?.status,
      welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
      rootHidden: document.querySelector("[data-mp-root]")?.hidden,
    };
  });
  results.checks.skipPersists = {
    status: afterSkip.status,
    hiddenAfterSkip: afterSkip.rootHidden && afterSkip.welcomeHidden,
    noRelaunch: afterRelaunch.status === "skipped" && afterRelaunch.welcomeHidden !== false && afterRelaunch.rootHidden !== false,
  };
  await page.close();
}

// 6. Completed users do not relaunch
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setupUser(page, "completed_qa", {});
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.click("[data-mp-verify]");
    await page.waitForTimeout(200);
  }
  await page.click("[data-mp-enter]");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.MissionPathController.onAuthReady(window._clerkUser));
  await page.waitForTimeout(1200);
  const completedRelaunch = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users?.completed_qa;
    return {
      status: u?.status,
      welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
      rootHidden: document.querySelector("[data-mp-root]")?.hidden,
    };
  });
  results.checks.completedNoRelaunch =
    completedRelaunch.status === "completed" &&
    completedRelaunch.welcomeHidden !== false &&
    completedRelaunch.rootHidden !== false;
  await page.close();
}

// 7. Minimized users resume via pill
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setupUser(page, "minimize_qa", {});
  await page.click("[data-mp-begin]");
  await page.waitForTimeout(500);
  await page.click("[data-mp-minimize]");
  await page.waitForTimeout(300);
  const afterMinimize = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users?.minimize_qa;
    return {
      status: u?.status,
      minimized: u?.minimized,
      pillVisible: !document.querySelector("[data-mp-pill]")?.hidden,
    };
  });
  await page.evaluate(() => window.MissionPathController.onAuthReady(window._clerkUser));
  await page.waitForTimeout(1200);
  const afterRelaunch = await page.evaluate(() => ({
    pillVisible: !document.querySelector("[data-mp-pill]")?.hidden,
    welcomeHidden: document.querySelector("[data-mp-welcome]")?.hidden,
    panelHidden: document.querySelector("[data-mp-panel]")?.hidden,
  }));
  results.checks.minimizedResumes = {
    persisted: afterMinimize.status === "active" && afterMinimize.minimized === true,
    pillAfterMinimize: afterMinimize.pillVisible,
    pillAfterRelaunch: afterRelaunch.pillVisible,
    noWelcome: afterRelaunch.welcomeHidden !== false,
    panelStillHidden: afterRelaunch.panelHidden !== false,
  };
  await page.close();
}

// 8. Restart overrides skipped/completed state
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.MissionPathController);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const userId = "restart_override_qa";
    const user = { id: userId, publicMetadata: {} };
    localStorage.setItem(
      "brieftick_mission_path_v1",
      JSON.stringify({
        version: 1,
        users: {
          [userId]: {
            version: 1,
            status: "skipped",
            currentMission: 2,
            completedMissions: [0, 1],
            skippedMissions: [],
            mission1Checklist: [],
            sessionStarted: true,
            minimized: false,
            xp: 100,
            skippedAt: new Date().toISOString(),
          },
        },
      })
    );
    window._clerkUser = user;
    window.MissionPathController.restartMission(true);
  });
  await page.waitForTimeout(1000);
  const restartOverride = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("brieftick_mission_path_v1") || "{}").users
      ?.restart_override_qa;
    return {
      status: u?.status,
      currentMission: u?.currentMission,
      welcomeVisible: !document.querySelector("[data-mp-welcome]")?.hidden,
    };
  });
  results.checks.restartOverrides = {
    status: restartOverride.status,
    resetMission: restartOverride.currentMission === 0,
    welcomeVisible: restartOverride.welcomeVisible,
  };
  await page.close();
}

await browser.close();

const skipOk =
  results.checks.skipPersists?.status === "skipped" &&
  results.checks.skipPersists?.hiddenAfterSkip &&
  results.checks.skipPersists?.noRelaunch;

const minimizeOk =
  results.checks.minimizedResumes?.persisted &&
  results.checks.minimizedResumes?.pillAfterMinimize &&
  results.checks.minimizedResumes?.pillAfterRelaunch &&
  results.checks.minimizedResumes?.noWelcome;

const restartOverrideOk =
  results.checks.restartOverrides?.status === "active" &&
  results.checks.restartOverrides?.resetMission &&
  results.checks.restartOverrides?.welcomeVisible;

const pass =
  results.checks.adminNoAutoLaunch &&
  results.checks.missionRestart &&
  results.checks.settings?.resumed &&
  results.checks.settings?.afterResetEmpty &&
  results.checks.onboardBannerRemoved &&
  results.checks.localStorage?.afterBegin?.hasKey &&
  results.checks.localStorage?.afterComplete?.status === "completed" &&
  results.checks.localStorage?.afterComplete?.xp === 325 &&
  skipOk &&
  results.checks.completedNoRelaunch &&
  minimizeOk &&
  restartOverrideOk;

console.log(JSON.stringify({ pass, results }, null, 2));
process.exit(pass ? 0 : 1);
