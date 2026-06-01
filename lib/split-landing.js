/**
 * Concept 10 Split — production landing (matches Design Lab build10 layout).
 */
import {
  buildSplitEnvHtml,
  buildSplitRiversHtml,
  initSplitCinematic,
  refreshSplitRivers,
} from "./split-atmosphere.js";

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
    "I used to keep eight tabs open just to make sense of a Fed day. BriefTick replaced six of them and made the other two faster.",
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
  return CW_PHRASES.map(
    (p, i) => `<span class="cw-phrase" style="--d:${i * 0.6}s">${esc(p)}</span>`
  ).join("");
}

function cwCta() {
  return `<div class="cw-cta">
    <button type="button" class="cw-cta-pri" data-split-action="signup">Start Free →</button>
    <button type="button" class="cw-cta-sec" data-split-action="demo">View Live Demo ↗</button>
  </div>`;
}

function sceneTitle() {
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

  return `<section class="cw-scene cw-scene--center">
    <span class="cw-float" style="left:8%;top:20%">NYSE OPEN</span>
    <span class="cw-float" style="right:10%;top:30%;animation-delay:-5s">LIVE STREAM</span>
    <div class="cw-scene-inner">
      <div class="cw-eyebrow"><span class="pulse"></span> Live Beta · Cohort II Open</div>
      <span class="cw-type-line" style="--i:0">Understand</span>
      <span class="cw-type-line" style="--i:1">what moves</span>
      <span class="cw-type-line" style="--i:2"><em class="gold">markets.</em></span>
      <p class="cw-sub">Real-time market intelligence across earnings, macro events, sentiment, and market-moving news. Built to explain the why behind every move.</p>
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
      <h2 class="cw-section-title">Nine modules. <em>One</em> intelligence layer.</h2>
      <p class="cw-sub" style="margin-bottom:28px;max-width:52ch">Every feature shares a single market graph - so a tariff headline, a watchlist alert and a sector heatmap all speak the same language.</p>
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
      <p class="cw-sub" style="text-align:center;margin:0 auto 8px">Explore the full platform for free. Unlock the full depth of market intelligence with Terminal.</p>
      <div class="cw-monoliths">
        <div class="cw-monolith">
          <h3>Free</h3>
          <p style="opacity:.5;font-size:12px">Learn what moves markets.</p>
          <div class="price">£0</div>
          <ul>
            <li>Full Dashboard access</li>
            <li>Top Movers &amp; Sector Heatmap</li>
            <li>Earnings Calendar</li>
            <li>Watchlist limited to 3 stocks</li>
            <li>Ask Logic preview (5 daily questions)</li>
            <li>Discover Stocks lite mode</li>
          </ul>
          <button type="button" class="cw-monolith-cta" data-split-action="signup">Start Free</button>
        </div>
        <div class="cw-monolith cw-monolith--feat">
          <div class="cw-eyebrow">Best Value</div>
          <h3>Terminal</h3>
          <p style="opacity:.5;font-size:12px">Institutional-grade market intelligence.</p>
          <div class="price">£29</div>
          <ul>
            <li>Everything in Free</li>
            <li>Unlimited Ask Logic</li>
            <li>Real-time market context</li>
            <li>My Portfolio insights</li>
            <li>Scenario Analysis</li>
            <li>Advanced Discover Stocks</li>
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

function buildWorldHtml() {
  const scenes =
    sceneTitle() + sceneStream() + sceneVoices() + scenePlans() + sceneFinale();
  const n = (scenes.match(/cw-scene/g) || []).length;
  return `<div class="cw cw--dual cw--snap" data-cw-variant="dual">
    ${buildSplitEnvHtml(28)}${buildSplitRiversHtml()}
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

export function mountSplitLanding() {
  const mount = document.getElementById("splitLandingMount");
  if (!mount) return;

  document.documentElement.setAttribute("data-split-landing", "1");
  mount.innerHTML = buildWorldHtml();
  wireActions(mount);
  if (teardown) teardown();
  teardown = initSplitCinematic(mount, { snap: true, pointerTarget: mount });

  const refresh = () => refreshSplitRivers(mount);
  refresh();
  setTimeout(refresh, 600);
  setTimeout(refresh, 2500);
}

export function unmountSplitLanding() {
  document.documentElement.removeAttribute("data-split-landing");
  if (teardown) {
    teardown();
    teardown = null;
  }
}
