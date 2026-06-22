import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3457/";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await p.evaluate(() => window.route("why"));
await p.waitForTimeout(3000);
const r = await p.evaluate(() => ({
  wheel: {
    labels: [
      ...(document.querySelector("#whmWheelViewport")?.querySelectorAll(".intel-wheel__chip-label") || []),
    ].map((l) => l.textContent.trim()),
    chipCount: document.querySelector("#whmWheelViewport")?.querySelectorAll(".intel-wheel__chip").length ?? 0,
  },
  nav: {
    hasBrief: !!document.querySelector('[data-route="brief"]'),
    hasImpact: !!document.querySelector('[data-route="impact"]'),
    hasWhy: !!document.querySelector('[data-route="why"]'),
  },
  redirects: (() => {
    window.route("brief");
    const b = window._activeRoute;
    window.route("impact");
    const i = window._activeRoute;
    return { brief: b, impact: i };
  })(),
  deepDive: (() => {
    const btn = document.querySelector("#whmWheelEngine .briefing-stock");
    if (!btn) return { ok: false };
    const sym = btn.dataset.sym;
    if (typeof window.openTickerDeepDive === "function") {
      window.openTickerDeepDive({ symbol: sym, source: "movers", tab: "overview" });
    }
    return {
      ok: true,
      sym,
      overlay: !!document.querySelector(".tdd-root.is-open, .tdd-panel, [data-tdd-open='true']"),
    };
  })(),
}));
console.log(JSON.stringify(r, null, 2));
await b.close();
