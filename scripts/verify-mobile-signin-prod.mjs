#!/usr/bin/env node
/**
 * Production smoke — mobile drawer Sign In → Clerk submit → network + visible outcome.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const EMAIL = process.env.CLERK_TEST_EMAIL || "test-mobile-login@example.com";
const PASSWORD = process.env.CLERK_TEST_PASSWORD || "TestPassword123!";
const OUT = path.join("reports", "mobile-signin-verify");

const VIEWPORTS = [
  { name: "iphone-13", ...devices["iPhone 13"] },
  { name: "samsung-s24", viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  { name: "iphone-15-pro-max", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
];

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({
    ...vp,
    viewport: vp.viewport || vp.viewportSize || { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const log = {
    viewport: vp.name,
    clerkRequests: [],
    clerkResponses: [],
    pageErrors: [],
    events: [],
  };

  page.on("pageerror", (e) => log.pageErrors.push(e.message));
  page.on("request", (req) => {
    if (/clerk\.forgeniq\.com.*sign_ins/i.test(req.url())) {
      log.clerkRequests.push({ method: req.method(), url: req.url() });
    }
  });
  page.on("response", (res) => {
    if (/clerk\.forgeniq\.com.*sign_ins/i.test(res.url())) {
      log.clerkResponses.push({ status: res.status(), url: res.url() });
    }
  });

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);

  await page.click("#navMenuBtn");
  await page.waitForTimeout(400);

  const drawerSignIn = page.locator(".nav-a__drawer-auth .nav-drawer-signin, .nav-a__drawer-auth .auth-signin-btn");
  await drawerSignIn.first().click();
  await page.waitForTimeout(3500);

  const modalVisible = await page.evaluate(() => {
    const m = document.querySelector(".cl-modalContent");
    return !!m && getComputedStyle(m).display !== "none";
  });
  log.events.push(modalVisible ? "modal-open" : "modal-missing");

  const emailInput = page.locator('input.cl-formFieldInput[name="identifier"]');
  if (await emailInput.count()) {
    await emailInput.first().fill(EMAIL);
    log.events.push("filled-email");
  }

  const passInput = page.locator('input.cl-formFieldInput[name="password"]');
  if (!(await passInput.count())) {
    const cont = page.locator(".cl-formButtonPrimary:visible");
    if (await cont.count()) {
      await cont.first().click();
      await page.waitForTimeout(2000);
      log.events.push("clicked-continue");
    }
  }
  if (await passInput.count()) {
    await passInput.first().fill(PASSWORD);
    log.events.push("filled-password");
  }

  const submitBlocked = await page.evaluate(() => {
    const btn = document.querySelector(".cl-modalContent .cl-formButtonPrimary");
    if (!btn) return { missing: true };
    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y);
    return {
      blocked: top !== btn && !btn.contains(top),
      top: top ? top.tagName + "." + (top.className || "").toString().slice(0, 40) : null,
    };
  });
  log.submitBlocked = submitBlocked;

  const reqBefore = log.clerkRequests.length;
  const submitBtn = page.locator(".cl-modalContent .cl-formButtonPrimary:visible");
  if (await submitBtn.count()) {
    await submitBtn.first().click();
    await page.waitForTimeout(5000);
    log.events.push("clicked-submit");
  }

  log.signInPosts = log.clerkRequests.length - reqBefore;
  log.signedIn = await page.evaluate(() => !!(window.Clerk?.user || window._clerkUser));
  log.errorVisible = await page.evaluate(() => {
    const el = document.querySelector(".cl-formFieldErrorText, .cl-formFieldError");
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && (el.textContent || "").trim().length > 0;
  });
  log.mobileAuthedClass = await page.evaluate(() => document.body.classList.contains("bt-mobile-authed"));
  log.onDashboard = await page.evaluate(() => window._activeRoute === "dashboard");

  log.pass =
    log.events.includes("modal-open") &&
    log.events.includes("clicked-submit") &&
    !submitBlocked.blocked &&
    (log.signInPosts > 0 || log.signedIn) &&
    (log.signedIn || log.errorVisible || log.onDashboard);

  await page.screenshot({ path: path.join(OUT, `signin-${vp.name}.png`) });
  await ctx.close();
  return log;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const vp of VIEWPORTS) {
    reports.push(await runViewport(browser, vp));
  }
  await browser.close();

  const pass = reports.every((r) => r.pass);
  const out = { pass, baseUrl: BASE, reports };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
