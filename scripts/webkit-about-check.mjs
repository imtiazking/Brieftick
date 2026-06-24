#!/usr/bin/env node
import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "https://www.forgeniq.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(4000);
await page.click("#navMenuBtn");
await page.waitForTimeout(400);
await page.click('#navDrawerLinks .nav-link[data-route="about"]');
await page.waitForTimeout(2000);

const r = await page.evaluate(() => ({
  activeRoute: window._activeRoute,
  democratise: document.body.innerText.includes("Democratise market intelligence"),
  top: (() => {
    const el = document.elementFromPoint(195, 400);
    return el ? `${el.tagName} ${(el.className || "").toString().slice(0, 50)}` : null;
  })(),
  pageAbout: getComputedStyle(document.getElementById("page-about")).display,
  landing: getComputedStyle(document.getElementById("page-landing")).display,
  scrollY: window.scrollY,
  navDrawerOpen: document.body.classList.contains("nav-drawer-open"),
}));

await page.screenshot({ path: "reports/mobile-about-diagnosis/webkit-iphone-about.png" });
console.log(JSON.stringify({ r, errors }, null, 2));
await browser.close();
process.exit(r.democratise ? 0 : 1);
