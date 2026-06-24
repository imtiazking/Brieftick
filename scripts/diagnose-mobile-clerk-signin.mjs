#!/usr/bin/env node
/**
 * Mobile Clerk Sign In diagnostic — modal submit, taps, network.
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const EMAIL = process.env.CLERK_TEST_EMAIL || "test-mobile-login@example.com";
const PASSWORD = process.env.CLERK_TEST_PASSWORD || "TestPassword123!";
const OUT = path.join("reports", "mobile-clerk-signin");

const VIEWPORTS = [
  { name: "iphone-13", ...devices["iPhone 13"] },
  { name: "samsung-s24", viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  { name: "iphone-15-pro-max", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
];

async function openSignInModal(page) {
  await page.click("#navMenuBtn");
  await page.waitForTimeout(500);
  const drawerSignIn = page.locator(".nav-a__drawer-auth .nav-drawer-signin, .nav-a__drawer-auth .auth-signin-btn");
  if (await drawerSignIn.count()) {
    await drawerSignIn.first().click();
  } else {
    await page.evaluate(() => window.clerkSignIn?.());
  }
  await page.waitForTimeout(3000);
}

async function inspectModal(page) {
  return page.evaluate(() => {
    const modal = document.querySelector(".cl-modalContent, .cl-rootBox");
    const backdrop = document.querySelector(".cl-modalBackdrop");
    const submit = document.querySelector(
      '.cl-formButtonPrimary, button[type="submit"], .cl-button[data-localization-key*="signIn"]'
    );
    const email = document.querySelector('input[name="identifier"], input[type="email"], input[inputmode="email"]');
    const password = document.querySelector('input[name="password"], input[type="password"]');

    const probe = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(x, y);
      const st = getComputedStyle(el);
      return {
        tag: el.tagName,
        class: (el.className || "").toString().slice(0, 80),
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        style: {
          display: st.display,
          visibility: st.visibility,
          opacity: st.opacity,
          pointerEvents: st.pointerEvents,
          zIndex: st.zIndex,
        },
        center: { x, y },
        topAtCenter: top
          ? { tag: top.tagName, class: (top.className || "").toString().slice(0, 60) }
          : null,
        blocked: top !== el && !el.contains(top),
      };
    };

    return {
      clerkReady: !!window.__btClerkInitialized,
      modalVisible: !!modal && getComputedStyle(modal).display !== "none",
      backdrop: backdrop
        ? { zIndex: getComputedStyle(backdrop).zIndex, pe: getComputedStyle(backdrop).pointerEvents }
        : null,
      modal: modal ? { zIndex: getComputedStyle(modal).zIndex, pe: getComputedStyle(modal).pointerEvents } : null,
      email: probe(email),
      password: probe(password),
      submit: probe(submit),
      bodyClass: document.body.className,
      drawerOpen: document.getElementById("navDrawer")?.classList.contains("is-open"),
    };
  });
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({
    ...vp,
    viewport: vp.viewport || vp.viewportSize || { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const log = {
    viewport: vp.name,
    errors: [],
    pageErrors: [],
    consoleErrors: [],
    requests: [],
    responses: [],
    events: [],
  };

  page.on("pageerror", (e) => log.pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") log.consoleErrors.push(msg.text());
  });

  page.on("request", (req) => {
    const url = req.url();
    if (/clerk|sign.?in|client|fapi/i.test(url)) {
      log.requests.push({ method: req.method(), url: url.slice(0, 200) });
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    if (/clerk|sign.?in|client|fapi/i.test(url)) {
      log.responses.push({ status: res.status(), url: url.slice(0, 200) });
    }
  });

  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    window.__btClerkDiag = { clicks: 0, submits: 0 };
    document.addEventListener(
      "click",
      (e) => {
        if (e.target.closest(".cl-modalContent, .cl-rootBox, #clerk-components")) {
          window.__btClerkDiag.clicks++;
        }
      },
      true
    );
    document.addEventListener(
      "submit",
      (e) => {
        if (e.target.closest(".cl-modalContent, .cl-rootBox, #clerk-components")) {
          window.__btClerkDiag.submits++;
        }
      },
      true
    );
  });

  await openSignInModal(page);
  log.afterOpen = await inspectModal(page);

  const emailInput = page.locator('input.cl-formFieldInput[name="identifier"]');
  if (await emailInput.count()) {
    await emailInput.first().fill(EMAIL);
    log.events.push("filled-email");
  } else {
    log.events.push("clerk-email-input-missing");
  }

  const passInput = page.locator('input.cl-formFieldInput[name="password"]');
  if (await passInput.count()) {
    await passInput.first().fill(PASSWORD);
    log.events.push("filled-password");
  } else {
    const continueBtn = page.locator(".cl-formButtonPrimary:visible");
    if (await continueBtn.count()) {
      const reqBefore = log.requests.length;
      await continueBtn.first().click();
      await page.waitForTimeout(2500);
      log.events.push("clicked-continue");
      log.continueRequests = log.requests.length - reqBefore;
      if (await passInput.count()) {
        await passInput.first().fill(PASSWORD);
        log.events.push("filled-password-after-continue");
      }
    }
  }

  log.beforeSubmit = await inspectModal(page);

  const submitBtn = page.locator(".cl-formButtonPrimary:visible");
  const reqBeforeSubmit = log.requests.length;
  const respBeforeSubmit = log.responses.length;

  if (await submitBtn.count()) {
    await submitBtn.first().click({ force: false });
    await page.waitForTimeout(4000);
    log.events.push("clicked-submit");
  } else {
    log.events.push("submit-button-not-found");
  }

  log.diag = await page.evaluate(() => window.__btClerkDiag);
  log.submitRequests = log.requests.length - reqBeforeSubmit;
  log.submitResponses = log.responses.length - respBeforeSubmit;
  log.signedIn = await page.evaluate(
    () => !!(window.Clerk?.user || window._clerkUser)
  );
  log.afterSubmit = await inspectModal(page);

  await page.screenshot({
    path: path.join(OUT, `clerk-signin-${vp.name}.png`),
    fullPage: false,
  });

  log.pass =
    log.afterOpen?.modalVisible &&
    log.beforeSubmit?.submit &&
    !log.beforeSubmit.submit.blocked &&
    log.events.includes("clicked-submit") &&
    (log.submitRequests > 0 || log.diag?.submits > 0);

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
