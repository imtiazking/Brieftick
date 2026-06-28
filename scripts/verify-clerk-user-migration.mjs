#!/usr/bin/env node
/**
 * Production Clerk user migration check (read-only UI + optional Backend API).
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = (process.argv[2] || "https://www.forgeniq.com").replace(/\/$/, "");
const EMAIL = process.argv[3] || "imtiazahmed_@hotmail.com";
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvSecret() {
  const candidates = [
    resolve(__dirname, "../.env.vercel.local"),
    resolve(__dirname, "../.env.local"),
    resolve(__dirname, "../.env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    const m = text.match(/^CLERK_SECRET_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.CLERK_SECRET_KEY || null;
}

async function clerkBackendStats(secret) {
  if (!secret || !secret.startsWith("sk_live_")) {
    return { ok: false, reason: "No sk_live_ secret available locally" };
  }
  const headers = { Authorization: `Bearer ${secret}` };
  const countRes = await fetch("https://api.clerk.com/v1/users/count", { headers });
  const countBody = countRes.ok ? await countRes.json() : await countRes.text();
  const listRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(EMAIL)}&limit=10`,
    { headers }
  );
  const listBody = listRes.ok ? await listRes.json() : await listRes.text();
  const users = Array.isArray(listBody) ? listBody : listBody?.data || [];
  const match = users.filter((u) =>
    (u.email_addresses || []).some(
      (e) => String(e.email_address).toLowerCase() === EMAIL.toLowerCase()
    )
  );
  return {
    ok: true,
    userCount: typeof countBody === "object" ? countBody.total_count ?? countBody.object : countBody,
    emailQueryStatus: listRes.status,
    emailMatches: match.length,
    matchIds: match.map((u) => u.id),
    keyType: secret.startsWith("sk_live_") ? "sk_live" : "other",
  };
}

async function modalText(page) {
  return page.evaluate(() => {
    const modal =
      document.querySelector(".cl-modalContent") ||
      document.querySelector(".cl-rootBox");
    const alerts = [...document.querySelectorAll(".cl-formFieldErrorText, .cl-alertText, [class*='formError']")]
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    return {
      modalVisible: !!modal,
      body: (modal?.innerText || "").slice(0, 1200),
      errors: alerts,
      pk:
        window.__btClerkPublishableKey ||
        document.querySelector("[data-clerk-publishable-key]")?.getAttribute("data-clerk-publishable-key"),
      clerkHost: window.Clerk?.frontendApi || null,
    };
  });
}

async function openSignIn(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.click(".auth-signin-btn", { timeout: 15000 });
  await page.waitForTimeout(3000);
}

async function attemptSignIn(page, email, password) {
  const modal = page.locator(".cl-modalContent, .cl-rootBox").first();
  await modal.waitFor({ state: "visible", timeout: 15000 });
  const idInput = modal.locator('input[name="identifier"], input[name="emailAddress"]').first();
  if ((await idInput.count()) > 0) {
    await idInput.fill(email);
  }
  const pwInput = modal.locator('input[type="password"]').first();
  if ((await pwInput.count()) > 0) {
    await pwInput.fill(password);
  }
  await modal.locator('.cl-formButtonPrimary, button:has-text("Continue")').first().click();
  await page.waitForTimeout(4500);
  return modalText(page);
}

async function main() {
  const report = { baseUrl: BASE, email: EMAIL, checks: {} };

  const cfg = await fetch(BASE + "/api/public-config").then((r) => r.json());
  report.checks.publishableKey = {
    key: cfg.clerkPublishableKey?.slice(0, 16) + "…",
    type: cfg.clerkPublishableKey?.startsWith("pk_live_") ? "pk_live" : "other",
    ok: cfg.clerkPublishableKey?.startsWith("pk_live_") === true,
  };

  const secret = loadEnvSecret();
  report.checks.backend = await clerkBackendStats(secret);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const clerkCalls = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (!/clerk/i.test(u)) return;
    let snippet = "";
    try {
      const ct = r.headers()["content-type"] || "";
      if (ct.includes("json") && r.status() < 500) {
        const j = await r.json();
        snippet = JSON.stringify(j).slice(0, 400);
      }
    } catch {}
    clerkCalls.push({ status: r.status(), url: u.slice(0, 100), snippet });
  });

  await page.setViewportSize({ width: 1280, height: 800 });

  // Sign-in identifier step
  await openSignIn(page);
  report.checks.signInModal = await modalText(page);
  const afterSignIn = await attemptSignIn(page, EMAIL, "WrongPasswordForMigrationTest!9");
  report.checks.signInAttempt = afterSignIn;
  const siText = (afterSignIn.body + afterSignIn.errors.join(" ")).toLowerCase();
  if (/couldn.?t find your account|no account found|not found|doesn.?t exist|identifier is invalid/i.test(siText)) {
    report.checks.signInVerdict = "user_not_found";
  } else if (/password is incorrect|is incorrect|wrong password|invalid credentials/i.test(siText)) {
    report.checks.signInVerdict = "existing_account_wrong_password";
  } else if (await page.evaluate(() => !!window.Clerk?.user)) {
    report.checks.signInVerdict = "signed_in";
  } else {
    report.checks.signInVerdict = "unknown";
  }

  // Sign-up flow
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.click(".auth-signup-btn", { timeout: 15000 });
  await page.waitForTimeout(3000);

  const suModal = page.locator(".cl-modalContent, .cl-rootBox").first();
  await suModal.waitFor({ state: "visible", timeout: 15000 });
  const suEmail = suModal.locator('input[name="emailAddress"], input[name="identifier"]').first();
  await suEmail.waitFor({ state: "visible", timeout: 10000 });
  await suEmail.fill(EMAIL);
  const pw = suModal.locator('input[type="password"]').first();
  if ((await pw.count()) > 0) {
    await pw.fill(`ForgeniqMigrate!${Date.now().toString(36).slice(-4)}`);
  }
  const first = suModal.locator('input[name="firstName"]').first();
  if ((await first.count()) > 0) await first.fill("Migration");
  await suModal.locator('.cl-formButtonPrimary, button:has-text("Continue")').first().click();
  await page.waitForTimeout(6000);
  report.checks.signUpResult = await modalText(page);
  const suText = (report.checks.signUpResult.body + report.checks.signUpResult.errors.join(" ")).toLowerCase();
  if (/already exists|taken|identifier_exists|is already/i.test(suText)) {
    report.checks.signUpVerdict = "email_already_exists";
  } else if (/verify|verification|check your email|enter the code|we sent/i.test(suText)) {
    report.checks.signUpVerdict = "signup_proceeded_verification";
  } else if (await page.evaluate(() => !!window.Clerk?.user)) {
    report.checks.signUpVerdict = "signup_succeeded_signed_in";
  } else if (report.checks.signUpResult.errors.length) {
    report.checks.signUpVerdict = "signup_error";
  } else {
    report.checks.signUpVerdict = "signup_blocked_or_pending";
  }

  report.checks.clerkApiSamples = clerkCalls.filter((c) => /sign|user|password|identifier/i.test(c.url)).slice(0, 8);
  report.checks.signedIn = await page.evaluate(() => !!window.Clerk?.user);

  await browser.close();

  if (!report.checks.backend.ok) {
    report.note =
      "Backend user count requires CLERK_SECRET_KEY (sk_live_) locally — run `vercel env pull` or check Clerk Dashboard → Users.";
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
