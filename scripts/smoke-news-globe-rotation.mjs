import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3458";
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = {};

/**
 * Calibrated story yaws — must match STORY_GLOBE_CONFIG.orient.yaw in
 * preview/dashboard-news-globe-three.js.
 *
 * Values come from yawToFaceLonLat(lon, lat) using three-geojson-geometry's
 * polar2Cartesian mapping (theta = 90° − lng). The old formula added a spurious
 * π/2 that pushed targets ~90° off, centreing open ocean instead of land.
 */
const CALIBRATED_STORY_YAW = {
  inflation: 1.675516081914556,
  ai: 2.129301687433082,
  europe: 0.610865238198015,
  energy: -0.8901179185171082,
};

/** Semantic land-centre bands — story orient lon/lat must fall inside these. */
const STORY_LAND_REGION = {
  inflation: { lonMin: -125, lonMax: -70, latMin: 22, latMax: 52 },
  ai: { lonMin: -135, lonMax: -105, latMin: 28, latMax: 48 },
  europe: { lonMin: -80, lonMax: 15, latMin: 35, latMax: 60 },
  energy: { lonMin: 30, lonMax: 65, latMin: 12, latMax: 38 },
};

function inLandRegion(orient, region) {
  if (!orient || !region) return false;
  const lon = orient.lon;
  const lat = orient.lat ?? 0;
  return (
    lon >= region.lonMin &&
    lon <= region.lonMax &&
    lat >= region.latMin &&
    lat <= region.latMax
  );
}

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
        orientAnim: layers.orientAnim,
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

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openDashboardNews(page);

  const readGlobeState = (storyId) =>
    page.evaluate((sid) => {
      const visual = document.querySelector('.news-narrative__visual[data-globe-bound="true"]');
      const api = visual?._globeCanvas;
      const layers = api?.layers;
      if (!layers?.globe) return null;
      return {
        yaw: layers.globe.rotation.y,
        orientAnim: layers.orientAnim,
        manualOverride: layers.manualOverride,
        orient: api.getStoryOrient?.(sid),
      };
    }, storyId);

  const clickStoryAndWait = async (storyId) => {
    await page.click(`[data-story-id="${storyId}"]`);
    await page.waitForTimeout(1300);
    return readGlobeState(storyId);
  };

  const storyYaws = {};
  for (const id of ["inflation", "ai", "europe", "energy"]) {
    const state = await clickStoryAndWait(id);
    storyYaws[id] = state?.yaw ?? null;
    const expectedYaw = CALIBRATED_STORY_YAW[id];
    const region = STORY_LAND_REGION[id];
    checks[`story_${id}_yaw`] =
      state != null &&
      typeof state.yaw === "number" &&
      Math.abs(state.yaw - expectedYaw) < 0.12;
    checks[`story_${id}_land`] =
      state?.orient != null && inLandRegion(state.orient, region);
    checks[`story_${id}_oriented`] =
      state != null &&
      state.orientAnim == null &&
      state.manualOverride === false &&
      checks[`story_${id}_yaw`] &&
      checks[`story_${id}_land`];
  }

  const yaws = Object.values(storyYaws).filter((y) => typeof y === "number");
  checks.storyYawsDistinct =
    yaws.length === 4 && new Set(yaws.map((y) => y.toFixed(2))).size === 4;
  checks.storyYawSamples = storyYaws;

  await page.click('[data-story-id="ai"]');
  await page.waitForTimeout(1200);
  const aiFx = await page.evaluate(() => {
    const api = document.querySelector(".news-narrative__visual")?._globeCanvas;
    const layers = api?.layers;
    const pulseOpacity =
      layers?.pulseRingEntries?.map((e) => e.mat?.opacity) ?? [];
    return {
      ...(api?.getStoryEffectState?.() ?? {}),
      pulseOpacity,
      fxActive: layers?.storySelectFx?.active === true,
    };
  });
  checks.storySelectFxActive =
    aiFx != null &&
    aiFx.pulseRingCount >= 2 &&
    aiFx.flowCount >= 1 &&
    aiFx.flowGlowCount >= 1 &&
    aiFx.fxActive === true;

  await page.waitForTimeout(2200);
  const aiFxContinuous = await page.evaluate(() => {
    const layers = document.querySelector(".news-narrative__visual")?._globeCanvas?.layers;
    const pulseOpacity = layers?.pulseRingEntries?.map((e) => e.mat?.opacity) ?? [];
    const flowOpacity = layers?.flowEntries?.map((e) => e.mat?.opacity) ?? [];
    const glowOpacity = layers?.flowGlowEntries?.map((e) => e.mat?.opacity) ?? [];
    return {
      pulseOpacity,
      flowOpacity,
      glowOpacity,
      fxActive: layers?.storySelectFx?.active === true,
    };
  });
  checks.storySelectFxContinuous =
    aiFxContinuous.fxActive === true &&
    aiFxContinuous.pulseOpacity.some((o) => o > 0.08) &&
    aiFxContinuous.flowOpacity.some((o) => o > 0.05) &&
    aiFxContinuous.glowOpacity.some((o) => o > 0.1);

  await page.click('[data-story-id="energy"]');
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    document
      .querySelector(".news-narrative__visual")
      ?.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
  });
  const yawBeforeIdle = (
    await sampleRotationFromPage(page)
  )?.yaw;
  await page.waitForTimeout(1800);
  const afterIdle = await sampleRotationFromPage(page);
  checks.idleResumesAfterStoryOrient =
    yawBeforeIdle != null &&
    afterIdle?.orientAnim == null &&
    afterIdle?.enabled === true &&
    afterIdle?.paused === false &&
    Math.abs(afterIdle.yaw - yawBeforeIdle) > 0.01;

  await page.close();
}

async function sampleRotationFromPage(page) {
  return page.evaluate(() => {
    const visual = document.querySelector('.news-narrative__visual[data-globe-bound="true"]');
    const layers = visual?._globeCanvas?.layers;
    if (!layers?.globe) return null;
    return {
      yaw: layers.globe.rotation.y,
      enabled: layers.idleRotationEnabled,
      paused: layers.idleRotationPaused,
      orientAnim: layers.orientAnim,
    };
  });
}

await browser.close();

const pass =
  errors.length === 0 &&
  checks.globeBound &&
  checks.idleRotationEnabled &&
  checks.yawDrifted &&
  checks.pausesOnHover &&
  checks.resumesAfterLeave &&
  checks.reducedMotionDisables &&
  checks.story_inflation_oriented &&
  checks.story_ai_oriented &&
  checks.story_europe_oriented &&
  checks.story_energy_oriented &&
  checks.storyYawsDistinct &&
  checks.storySelectFxActive &&
  checks.storySelectFxContinuous &&
  checks.idleResumesAfterStoryOrient;

console.log(JSON.stringify({ pass, errors, checks }, null, 2));
process.exit(pass ? 0 : 1);
