#!/usr/bin/env node
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
await page.goto("https://www.forgeniq.com/", { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(4000);
await page.click("#navMenuBtn");
await page.waitForTimeout(400);
await page.click(".nav-a__drawer-auth .auth-signin-btn");
await page.waitForTimeout(4000);

const r = await page.evaluate(() => {
  const btn = document.querySelector(".cl-modalContent .cl-formButtonPrimary");
  const card = document.querySelector(".cl-modalContent");
  const backdrop = document.querySelector(".cl-modalBackdrop");
  if (!btn) return { error: "no clerk submit" };
  const br = btn.getBoundingClientRect();
  const x = Math.round(br.left + br.width / 2);
  const y = Math.round(br.top + br.height / 2);
  const top = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint(x, y).slice(0, 6).map((el) => ({
    tag: el.tagName,
    cls: (el.className || "").toString().slice(0, 50),
    z: getComputedStyle(el).zIndex,
  }));
  return {
    btnRect: { top: br.top, left: br.left, w: br.width, h: br.height },
    center: { x, y },
    hit: top ? { tag: top.tagName, cls: (top.className || "").toString().slice(0, 50) } : null,
    blocked: top !== btn && !btn.contains(top),
    stack,
    cardZ: card ? getComputedStyle(card).zIndex : null,
    backdropZ: backdrop ? getComputedStyle(backdrop).zIndex : null,
    cardPe: card ? getComputedStyle(card).pointerEvents : null,
    backdropPe: backdrop ? getComputedStyle(backdrop).pointerEvents : null,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
