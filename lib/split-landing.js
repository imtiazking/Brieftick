/**
 * Concept 10 Split — production landing (matches Design Lab build10 layout).
 */
import {
  buildSplitEnvHtml,
  initSplitCinematic,
} from "./split-atmosphere.js";
import { isMobileConversionViewport } from "./mobile-conversion.js";

const CW_PHRASES = [
  "Risk-on selective",
  "Macro regime live",
  "Intelligence narrated",
  "Twelve modules · one graph",
  "Institutional calm",
  "The market, explained",
];

const TESTIMONIALS = [
  [
    "It's the first product that explains <em>why</em> something is happening, not just <em>what</em>. The reaction map alone changed how I read sector weakness.",
    "Mara Voss",
    "Portfolio Manager · Solo RIA",
  ],
  [
    "I used to keep eight tabs open just to make sense of a Fed day. FORGENIQ replaced six of them and made the other two faster.",
    "Jonas Reiter",
    "Macro Analyst · London",
  ],
  [
    "The morning briefing is genuinely the first thing I read. It feels written by a senior analyst who already pre-read the tape.",
    "Aisha Khoury",
    "Active Trader · 12 yrs",
  ],
];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cwProgress(n) {
  return `<nav class="cw-progress" aria-hidden="true">${Array.from({ length: n }, (_, i) =>
    `<i${i === 0 ? ' class="is-on"' : ""}></i>`
  ).join("")}</nav>`;
}

function cwPhrases() {
  return CW_PHRASES.map((p) => `<span class="cw-phrase">${esc(p)}</span>`).join("");
}

function isLandingUserSignedIn() {
  return Boolean(window._clerkUser);
}

function cwCta() {
  if (isLandingUserSignedIn()) return "";
  return `<div class="cw-cta" data-split-landing-cta>
    <button type="button" class="cw-cta-pri" data-split-action="signup">Start Free →</button>
  </div>`;
}

function heroMobileCtas() {
  if (isLandingUserSignedIn()) return "";
  return `<div class="cw-hero-ctas cw-hero-ctas--mobile" data-split-landing-hero-cta>
    <button type="button" class="cw-cta-pri cw-hero-cta-btn mobile-start-free" data-auth-action="signup" data-split-action="signup">Start Free</button>
    <button type="button" class="cw-cta-sec cw-hero-cta-btn mobile-explore-dashboard" data-split-action="demo" data-route="dashboard">Explore Dashboard</button>
  </div>`;
}

/** Finale hero CTA: signed-out only. Safe to call after Clerk auth changes. */
export function syncSplitLandingCtas() {
  const mount = document.getElementById("splitLandingMount");
  if (!mount || !document.documentElement.hasAttribute("data-split-landing")) return;

  const signedIn = isLandingUserSignedIn();

  mount.querySelectorAll('[data-split-action="demo"]').forEach((el) => {
    if (el.closest("[data-split-landing-hero-cta]")) return;
    el.remove();
  });

  mount.querySelectorAll("[data-split-landing-hero-cta]").forEach((wrap) => {
    wrap.hidden = signedIn;
    wrap.setAttribute("aria-hidden", signedIn ? "true" : "false");
  });

  mount.querySelectorAll('[data-split-action="signup"]').forEach((btn) => {
    btn.hidden = signedIn;
    btn.setAttribute("aria-hidden", signedIn ? "true" : "false");
  });

  let wrap = mount.querySelector("[data-split-landing-cta]");

  if (signedIn) {
    wrap?.remove();
    return;
  }

  if (!wrap) {
    const inner = mount.querySelector(".cw-type-line--finale")?.closest(".cw-scene-inner");
    if (inner) {
      inner.insertAdjacentHTML("beforeend", cwCta());
      wireActions(mount);
    }
  }
}

function sceneTitle(mobile = false) {
  const proof = [
    ["Live market data", "Streaming context"],
    ["12,000+ equities", "Global coverage"],
    ["Earnings monitoring", "Real-time updates"],
    ["Market intelligence", "Built for investors"],
  ]
    .map(
      ([b, s]) =>
        `<div class="cw-proof-item"><b>${esc(b)}</b><span>${esc(s)}</span></div>`
    )
    .join("");

  return `<section class="cw-scene cw-scene--center cw-scene--hero">
    <span class="cw-float" style="left:8%;top:20%">NYSE OPEN</span>
    <span class="cw-float" style="right:10%;top:30%;animation-delay:-5s">LIVE STREAM</span>
    <div class="cw-scene-inner cw-hero-copy--stable">
      <div class="cw-eyebrow"><span class="pulse"></span> Live Beta · Cohort II Open</div>
      <h1 class="cw-hero-editorial">
        <span class="cw-ed-line cw-ed-line--split cw-ed-metallic cw-ed-metallic--silver" data-cw-ed-line="1">
          <span class="cw-ed-line__curtain">
            <span class="cw-ed-metallic__base" aria-hidden="true">Investment</span>
            <span class="cw-ed-metallic__shine">Investment</span>
          </span>
        </span>
        <span class="cw-ed-line cw-ed-line--split cw-ed-metallic cw-ed-metallic--silver" data-cw-ed-line="2">
          <span class="cw-ed-line__curtain">
            <span class="cw-ed-metallic__base" aria-hidden="true">Intelligence</span>
            <span class="cw-ed-metallic__shine">Intelligence</span>
          </span>
        </span>
        <span class="cw-ed-line cw-ed-line--split cw-ed-line--italic cw-ed-line--without" data-cw-ed-line="3">
          <span class="cw-ed-line__curtain cw-ed-line__curtain--flex">
            <span class="cw-ed-metallic cw-ed-metallic--gold cw-ed-metallic--inline">
              <span class="cw-ed-metallic__base" aria-hidden="true">Without</span>
              <span class="cw-ed-metallic__shine">Without</span>
            </span>
            <span class="cw-ed-the">the</span>
          </span>
        </span>
        <span class="cw-ed-line cw-ed-line--split cw-ed-line--italic cw-ed-metallic cw-ed-metallic--gold" data-cw-ed-line="4">
          <span class="cw-ed-line__curtain">
            <span class="cw-ed-metallic__base" aria-hidden="true">Noise</span>
            <span class="cw-ed-metallic__shine">Noise</span>
          </span>
        </span>
      </h1>
      <p class="cw-tagline">FORGENIQ explains.<br>Your broker executes.</p>
      <p class="cw-sub">Understand what moves markets. See how they affect your portfolio. Build conviction. Execute with your broker.</p>
      ${mobile ? heroMobileCtas() : ""}
      <div class="cw-proof">${proof}</div>
      <div class="cw-phrases">${cwPhrases()}</div>
    </div>
  </section>`;
}

function featureItems() {
  const ext = window.BT_FEATURE_DATA;
  if (Array.isArray(ext) && ext.length) {
    return ext.map(([t, d, tag]) => [t, d, tag]);
  }
  return [];
}

function sceneStream() {
  const items = featureItems()
    .map(
      ([t, d, tag]) =>
        `<div class="cw-vert-item"><span>${esc(tag)}</span><strong>${esc(t)}</strong><p>${esc(d)}</p></div>`
    )
    .join("");
  const dup = items + items;
  return `<section class="cw-scene">
    <div class="cw-scene-inner">
      <div class="cw-eyebrow">What it does</div>
      <h2 class="cw-section-title">Twelve modules. <em>One</em> intelligence layer.</h2>
      <p class="cw-sub" style="margin-bottom:28px;max-width:52ch">Twelve modules share one intelligence graph. Connected market narratives come first, then the data behind them, so portfolio, movers, insiders, and options all speak the same language.</p>
      <div class="cw-vert-stream"><div class="cw-vert-stream-inner">${dup}</div></div>
    </div>
  </section>`;
}

function sceneVoices() {
  const voices = TESTIMONIALS.map(
    ([q, n, r], i) =>
      `<div class="cw-voice" style="margin-bottom:48px;opacity:${0.85 - i * 0.1}">${q}
        <div class="cw-voice-meta"><strong>${esc(n)}</strong> · ${esc(r)}</div></div>`
  ).join("");
  return `<section class="cw-scene cw-scene--center">
    <div class="cw-scene-inner">
      <div class="cw-eyebrow">Early access voices</div>
      ${voices}
    </div>
  </section>`;
}

function scenePlans() {
  return `<section class="cw-scene cw-scene--center">
    <div class="cw-scene-inner">
      <div class="cw-eyebrow" style="text-align:center">Pricing</div>
      <h2 class="cw-section-title" style="text-align:center;margin-bottom:8px">Two plans. <em>One goal.</em></h2>
      <p class="cw-sub" style="text-align:center;margin:0 auto 8px">Explore story-first market intelligence for free. Unlock connected stories and full module depth with Terminal.</p>
      <p class="cw-sub" style="text-align:center;margin:0 auto 16px;max-width:52ch;opacity:0.72;font-size:13px">12 modules · one graph. Portfolios, earnings, macro, options, insiders, market stories, and Deep Dive on one intelligence graph.</p>
      <div class="cw-monoliths">
        <div class="cw-monolith">
          <h3>Free</h3>
          <p style="opacity:.5;font-size:12px">Understand what moves markets and how they affect your portfolio.</p>
          <div class="price">£0</div>
          <ul>
            <li>Full Dashboard access</li>
            <li>Top Movers &amp; Sector Heatmap</li>
            <li>Earnings Calendar</li>
            <li>Watchlist limited to 3 stocks</li>
            <li>Ask Logic preview (5 daily questions): markets, macro, sectors, portfolios, and stocks on the same intelligence graph.</li>
            <li>Discover Stocks: market story preview</li>
            <li>Daily Brief: 1 briefing per day</li>
            <li>Core macro context</li>
          </ul>
          <button type="button" class="cw-monolith-cta" data-split-action="signup">Start Free</button>
        </div>
        <div class="cw-monolith cw-monolith--feat">
          <div class="cw-eyebrow">Best Value</div>
          <h3>Terminal</h3>
          <p style="opacity:.5;font-size:12px">Story-first intelligence with full platform depth.</p>
          <div class="price">£29</div>
          <ul>
            <li>Everything in Free</li>
            <li>Unlimited Ask Logic: markets, macro, sectors, portfolios, and stocks on the same intelligence graph.</li>
            <li>Connected stories across portfolios, markets, earnings, options, insiders, and macro signals</li>
            <li>Portfolio Story, Deep Dive, Smart Money Flow, and Options Story</li>
            <li>Full Discover Stocks: market story and scans</li>
            <li>Live Market Flows &amp; Capital Movement</li>
            <li>Full Market Telemetry</li>
          </ul>
          <button type="button" class="cw-monolith-cta" data-split-action="checkout">Unlock Terminal</button>
        </div>
      </div>
      <button type="button" class="cw-monolith-link" data-split-action="pricing">View full plan comparison →</button>
    </div>
  </section>`;
}

function sceneFinale() {
  return `<section class="cw-scene cw-scene--center">
    <div class="cw-scene-inner">
      <div class="cw-eyebrow">The market deserves better narration</div>
      <h2 class="cw-type-line cw-type-line--finale" style="--i:0">Stop reading the tape.<br><em class="gold">Start understanding it.</em></h2>
      ${cwCta()}
    </div>
  </section>`;
}

function buildWorldHtml(mobile = false) {
  const scenes =
    sceneTitle(mobile) + sceneStream() + sceneVoices() + scenePlans() + sceneFinale();
  const n = (scenes.match(/cw-scene/g) || []).length;
  if (mobile) {
    return `<div class="cw cw--mobile-static" data-cw-variant="mobile">
    <div class="cw-mobile-bg" aria-hidden="true"></div>
    <div class="cw-scenes cw-scenes--mobile">${scenes}</div>
  </div>`;
  }
  return `<div class="cw cw--dual cw--snap" data-cw-variant="dual">
    ${buildSplitEnvHtml(28)}
    <div class="cw-hud">LIVE · BETA</div>
    ${cwProgress(n)}
    <div class="cw-scenes">${scenes}</div>
  </div>`;
}

function wireActions(root) {
  root.querySelectorAll("[data-split-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-split-action");
      if (action === "signup" && typeof window.clerkSignUp === "function") {
        window.clerkSignUp();
      } else if (action === "demo" && typeof window.routeWithAuth === "function") {
        window.routeWithAuth("dashboard");
      } else if (action === "pricing" && typeof window.route === "function") {
        window.route("pricing");
      } else if (action === "checkout" && typeof window.startCheckout === "function") {
        window.startCheckout("intelligence", btn);
      }
    });
  });
}

let teardown = null;
let heroHasRevealed = false;

function wireHeroCurtainReveal(mount) {
  const hero = mount.querySelector(".cw-scene--hero");
  if (!hero) return;

  const markRevealed = () => {
    if (heroHasRevealed) return;
    heroHasRevealed = true;
    hero.classList.add("has-revealed");
  };

  if (heroHasRevealed) {
    hero.classList.add("has-revealed", "is-active");
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hero.classList.add("has-revealed", "is-active");
    heroHasRevealed = true;
    return;
  }

  const lastCurtain = hero.querySelector('[data-cw-ed-line="4"] .cw-ed-line__curtain');
  if (lastCurtain) {
    lastCurtain.addEventListener("animationend", markRevealed, { once: true });
    setTimeout(markRevealed, 960);
  }
}

export function mountSplitLanding() {
  const mount = document.getElementById("splitLandingMount");
  if (!mount) return;

  const mobile = isMobileConversionViewport();
  document.documentElement.setAttribute("data-split-landing", "1");
  mount.innerHTML = buildWorldHtml(mobile);
  wireHeroCurtainReveal(mount);
  wireActions(mount);
  syncSplitLandingCtas();
  if (teardown) teardown();
  if (mobile) {
    const hero = mount.querySelector(".cw-scene--hero");
    hero?.classList.add("has-revealed", "is-active");
    teardown = null;
  } else {
    teardown = initSplitCinematic(mount, { snap: true, pointerTarget: mount });
  }
}

export function unmountSplitLanding() {
  document.documentElement.removeAttribute("data-split-landing");
  if (teardown) {
    teardown();
    teardown = null;
  }
}
