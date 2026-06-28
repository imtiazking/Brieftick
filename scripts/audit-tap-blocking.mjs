#!/usr/bin/env node
/**
 * URGENT — find what elementFromPoint returns on mobile tap targets.
 */
import { chromium } from "playwright";

const BASE = "https://www.forgeniq.com";
const VIEWPORTS = [
  { id: "iphone-13", width: 390, height: 844 },
  { id: "iphone-15-pro", width: 430, height: 932 },
  { id: "samsung-s24", width: 412, height: 915 },
];

function probeAt(page, label, selector) {
  return page.evaluate(
    ({ label, selector }) => {
      const el = document.querySelector(selector);
      if (!el) return { label, selector, found: false };
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(x, y);
      const chain = [];
      let n = top;
      while (n && chain.length < 8) {
        const st = getComputedStyle(n);
        chain.push({
          tag: n.tagName,
          id: n.id || null,
          cls: (n.className?.toString?.() || "").slice(0, 80),
          pe: st.pointerEvents,
          z: st.zIndex,
          pos: st.position,
          vis: st.visibility,
          op: st.opacity,
          disp: st.display,
        });
        n = n.parentElement;
      }
      const blocked = top !== el && !el.contains(top) && !top?.contains?.(el);
      return {
        label,
        selector,
        found: true,
        center: { x, y },
        inViewport: r.top < window.innerHeight && r.bottom > 0,
        rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        targetTag: el.tagName,
        targetCls: (el.className?.toString?.() || "").slice(0, 60),
        topElement: chain[0],
        blocked,
        chain,
      };
    },
    { label, selector }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = { baseUrl: BASE, viewports: [] };

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(5000);

    const probes = await Promise.all([
      probeAt(page, "Start Free (nav)", ".nav-a__end .auth-signup-btn"),
      probeAt(page, "Start Free (hero)", ".cw-hero-cta-btn[data-split-action='signup']"),
      probeAt(page, "Explore Dashboard", ".cw-hero-cta-btn[data-split-action='demo']"),
      probeAt(page, "Home (drawer)", "#navDrawerLinks .nav-link[data-route='landing']"),
      probeAt(page, "About (drawer)", "#navDrawerLinks .nav-link[data-route='about']"),
      probeAt(page, "Pricing (drawer)", "#navDrawerLinks .nav-link[data-route='pricing']"),
    ]);

    // Open drawer for drawer link probes
    await page.click("#navMenuBtn");
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const src = document.getElementById("navLinks");
      const dst = document.getElementById("navDrawerLinks");
      if (dst && src && !dst.dataset.cloned) {
        dst.innerHTML = "";
        src.querySelectorAll(".nav-link").forEach((btn) => {
          const c = btn.cloneNode(true);
          c.classList.add("nav-link--drawer");
          dst.appendChild(c);
        });
        dst.dataset.cloned = "1";
      }
    });

    const drawerProbes = await Promise.all([
      probeAt(page, "Home (drawer open)", "#navDrawerLinks .nav-link[data-route='landing']"),
      probeAt(page, "About (drawer open)", "#navDrawerLinks .nav-link[data-route='about']"),
      probeAt(page, "Pricing (drawer open)", "#navDrawerLinks .nav-link[data-route='pricing']"),
    ]);

    const overlays = await page.evaluate(() => {
      const suspects = [
        ...document.querySelectorAll(
          ".nav-a__drawer, .nav-a__drawer-backdrop, .split-landing-mount, .cw-mobile-bg, .cw, .cw-env, .cw-cam, canvas, #splitLandingMount, #page-landing"
        ),
      ];
      return suspects.map((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return {
          tag: el.tagName,
          id: el.id || null,
          cls: (el.className?.toString?.() || "").slice(0, 60),
          pe: st.pointerEvents,
          z: st.zIndex,
          pos: st.position,
          vis: st.visibility,
          op: st.opacity,
          coversViewport: r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.5,
          rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
        };
      });
    });

    report.viewports.push({ ...vp, probes, drawerProbes, overlays });
    await browser.close();
    break; // first viewport enough for root cause
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main();
