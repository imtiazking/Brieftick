#!/usr/bin/env node
/**
 * Production Clerk migration verification.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");

async function modalState(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const modal =
      document.querySelector(".cl-modalContent") ||
      document.querySelector(".cl-rootBox") ||
      document.querySelector("[class*='cl-modal']");
    const modalText = modal?.innerText || "";
    const googleBtn = document.querySelector(
      '.cl-socialButtons button, button[data-provider="google"], [class*="socialButtons"] button'
    );
    const pk =
      document.querySelector("[data-clerk-publishable-key]")?.getAttribute("data-clerk-publishable-key") ||
      window.Clerk?.publishableKey ||
      null;
    return {
      devBadgeText: bodyText.match(/development mode/i)?.[0] || null,
      modalVisible: !!(modal && getComputedStyle(modal).display !== "none"),
      modalText: modalText.slice(0, 800),
      hasBrieftickInModal: /brieftick/i.test(modalText),
      hasForgeniqInModal: /forgeniq/i.test(modalText),
      googlePresent: !!googleBtn,
      googleVisible: googleBtn ? getComputedStyle(googleBtn).display !== "none" : false,
      googleText: googleBtn?.innerText?.trim() || null,
      clerkLoaded: !!window.Clerk,
      clerkInit: !!window.__btClerkInitialized,
      openSignUp: typeof window.Clerk?.openSignUp,
      openSignIn: typeof window.Clerk?.openSignIn,
      publishableKey: pk,
      publishableKeyType: pk?.startsWith("pk_live_") ? "pk_live" : pk?.startsWith("pk_test_") ? "pk_test" : "unknown",
    };
  });
}

async function extractPageClerkInfo(page) {
  const html = await page.content();
  const keys = [...new Set(html.match(/pk_(live|test)_[A-Za-z0-9._$-]+/g) || [])];
  const sk = html.match(/sk_(live|test)_[A-Za-z0-9._$-]+/g) || [];
  return {
    keys,
    secretKeysInHtml: sk.length > 0,
    hasBrieftick: /brieftick/i.test(html),
    hasForgeniq: /forgeniq/i.test(html),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const clerkResponses = [];

  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") consoleErrors.push(t);
    if (m.type() === "warning" && /clerk/i.test(t)) consoleWarnings.push(t);
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => {
    if (/clerk/i.test(r.url())) {
      clerkResponses.push({ url: r.url().slice(0, 120), status: r.status() });
    }
  });

  const report = { baseUrl: BASE, pages: {}, actions: {} };

  await page.setViewportSize({ width: 390, height: 844 });

  for (const { path, name, routeFn } of [
    { path: "/", name: "landing", routeFn: null },
    { path: "/", name: "pricing", routeFn: "pricing" },
    { path: "/", name: "about", routeFn: "about" },
  ]) {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 90000 });
    if (routeFn) {
      await page.evaluate((r) => window.route?.(r), routeFn);
      await page.waitForTimeout(2000);
    }
    report.pages[name] = await extractPageClerkInfo(page);
  }

  // Landing — Start Free
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.click(".auth-signup-btn", { timeout: 15000 });
  await page.waitForTimeout(5000);
  report.actions.startFree = await modalState(page);

  // Sign In — mobile drawer uses delegated [data-auth-action="signin"]
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click("#navMenuBtn", { timeout: 10000 });
  await page.waitForTimeout(600);
  const drawerSignIn = page.locator("#navDrawerAuth .auth-signin-btn").first();
  if ((await drawerSignIn.count()) > 0) {
    await drawerSignIn.click({ timeout: 15000 });
    await page.waitForTimeout(5000);
    report.actions.signIn = await modalState(page);
  } else {
    await page.locator("#authSignInBtn").click({ force: true, timeout: 15000 });
    await page.waitForTimeout(5000);
    report.actions.signIn = await modalState(page);
  }

  // Explore Dashboard
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click(".mobile-explore-dashboard, [data-split-action='demo']", { timeout: 15000 });
  await page.waitForTimeout(5000);
  report.actions.exploreDashboard = await modalState(page);
  report.actions.exploreNavIntent = await page.evaluate(() => {
    try {
      return sessionStorage.getItem("bt_nav_intent");
    } catch {
      return null;
    }
  });

  report.consoleErrors = [...new Set(consoleErrors)];
  report.consoleWarnings = [...new Set(consoleWarnings)];
  report.pageErrors = [...new Set(pageErrors)];
  report.clerk4xx5xx = clerkResponses.filter((r) => r.status >= 400);
  report.clerkResponseCount = clerkResponses.length;
  report.clerkHosts = [...new Set(clerkResponses.map((r) => {
    try { return new URL(r.url).hostname; } catch { return null; }
  }).filter(Boolean))];

  const apiConfig = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/public-config");
      return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }).catch(() => ({ ok: false }));
  report.publicConfig = apiConfig;

  const pk =
    report.actions.startFree?.publishableKey ||
    report.publicConfig?.body?.clerkPublishableKey ||
    report.pages.landing?.keys?.[0] ||
    null;
  report.summary = {
    clerkEnvironment: pk?.startsWith("pk_live_") ? "Production" : pk?.startsWith("pk_test_") ? "Development" : "Unknown",
    publishableKeyType: pk?.startsWith("pk_live_") ? "pk_live" : pk?.startsWith("pk_test_") ? "pk_test" : "unknown",
    publishableKeyPrefix: pk ? pk.slice(0, 20) + "…" : null,
    secretKeyDetectedInClient: Object.values(report.pages).some((p) => p.secretKeysInHtml),
    devBadgeOnAnyAction: [report.actions.startFree, report.actions.signIn, report.actions.exploreDashboard].some(
      (a) => a?.devBadgeText
    ),
    brieftickInModal: [report.actions.startFree, report.actions.signIn, report.actions.exploreDashboard].some(
      (a) => a?.hasBrieftickInModal
    ),
    forgeniqInModal: [report.actions.startFree, report.actions.signIn, report.actions.exploreDashboard].some(
      (a) => a?.hasForgeniqInModal
    ),
    signUpModalOpens: report.actions.startFree?.modalVisible === true,
    signInModalOpens: report.actions.signIn?.modalVisible === true,
    dashboardGateOpens: report.actions.exploreDashboard?.modalVisible === true,
    clerkInitOk: report.actions.startFree?.clerkInit === true,
    googleOnSignUp: report.actions.startFree?.googlePresent,
    googleOnSignIn: report.actions.signIn?.googlePresent,
    clerkHttpErrors: report.clerk4xx5xx.length,
    consoleErrorCount: report.consoleErrors.length,
    clerkRelatedConsoleErrors: report.consoleErrors.filter((e) => /clerk/i.test(e)).length,
  };

  let verdict = "PASS";
  const blockers = [];
  const warnings = [];

  if (report.pages.landing?.keys?.some((k) => k.startsWith("pk_test_"))) {
    blockers.push("Production HTML still contains hardcoded pk_test_");
    verdict = "FAIL";
  }
  if (!report.clerkHosts.some((h) => h === "clerk.forgeniq.com") && report.summary.publishableKeyType === "pk_live") {
    warnings.push("Expected Clerk API host clerk.forgeniq.com not observed");
    if (verdict === "PASS") verdict = "PASS WITH WARNINGS";
  }
  if (report.summary.publishableKeyType !== "pk_live") {
    blockers.push("Publishable key is pk_test (development), not pk_live");
    verdict = "FAIL";
  }
  if (report.summary.devBadgeOnAnyAction) {
    blockers.push('"Development mode" badge visible in Clerk UI');
    verdict = "FAIL";
  }
  if (report.summary.brieftickInModal) {
    warnings.push('Clerk modal references "Brieftick"');
    if (verdict === "PASS") verdict = "PASS WITH WARNINGS";
  }
  if (!report.summary.signUpModalOpens) {
    blockers.push("Sign up modal did not open");
    verdict = "FAIL";
  }
  if (!report.summary.signInModalOpens) {
    blockers.push("Sign in modal did not open");
    verdict = "FAIL";
  }
  if (!report.summary.dashboardGateOpens) {
    blockers.push("Dashboard auth gate modal did not open");
    verdict = "FAIL";
  }
  if (report.summary.clerkHttpErrors > 0) {
    blockers.push(`${report.summary.clerkHttpErrors} Clerk HTTP 4xx/5xx responses`);
    verdict = "FAIL";
  }
  if (report.summary.clerkRelatedConsoleErrors > 0) {
    warnings.push("Clerk-related console errors present");
    if (verdict === "PASS") verdict = "PASS WITH WARNINGS";
  }
  if (!report.summary.forgeniqInModal && report.summary.signUpModalOpens) {
    warnings.push("FORGENIQ branding not detected in modal text (may be logo-only)");
    if (verdict === "PASS") verdict = "PASS WITH WARNINGS";
  }

  report.verdict = verdict;
  report.blockers = blockers;
  report.warnings = warnings;

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(verdict === "FAIL" ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
