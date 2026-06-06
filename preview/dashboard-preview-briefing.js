/**
 * Premium live market briefing — wheel Summary channel.
 * @module preview/dashboard-preview-briefing
 */

/** Static intro — what the Market Summary section measures. */
export const MARKET_SUMMARY_INTRO =
  "This is a simple overview of today's market conditions.";

/** Signals combined into today's overview. */
export const MARKET_SUMMARY_FACTORS = [
  "Market direction",
  "Investor sentiment",
  "Sector leadership",
  "Market breadth",
  "Money flow",
];

/** Design-lab / dashboard-preview only — not used in production app shell. */
export const PREVIEW_QUOTES = {
  SPY: { pctChange: 0.48, price: 512.2 },
  QQQ: { pctChange: 0.62, price: 445.1 },
  IWM: { pctChange: 0.08, price: 198.4 },
  NVDA: { pctChange: 1.98, price: 219.46 },
  XOM: { pctChange: 1.18, price: 118.62 },
};

/** @deprecated Production uses live window.riskState from market-risk-runner. */
export function initPreviewRiskState() {
  if (window.__DASHBOARD_PREVIEW) {
    window.riskState = {
      score: 38,
      label: "Risk-On",
      confidence: "Medium",
      quotes: { ...PREVIEW_QUOTES },
    };
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {object} [riskState]
 */
export function getIntelContext(riskState) {
  const rs = riskState || window.riskState || {};
  const q = rs.quotes || {};
  const label = rs.label || "Neutral";
  let regimeShort = label;
  let regimeCls = rs.regimeCls || "mixed";

  if (label === "Risk-On") regimeCls = "on";
  else if (label === "Risk-Off") regimeCls = "off";
  else if (label.includes("Cautious")) regimeCls = "mixed";

  return {
    q,
    regimeShort,
    regimeCls,
    breadthNarrow: !!rs.breadthNarrow,
    confidence: rs.confidence || "Medium",
    confidencePct: rs.confidencePct ?? 62,
    narrative: rs.narrative || {},
  };
}

function marketSummaryFactorsHtml() {
  return MARKET_SUMMARY_FACTORS.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderPulseVisual(uid) {
  return `<div class="briefing-story__visual" aria-hidden="true">
    <div class="briefing-story__pulse-ambient"></div>
    <svg class="briefing-story__pulse-svg" viewBox="0 0 480 120" preserveAspectRatio="none">
      <defs>
        <linearGradient id="briefingPulseGrad-${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(61,220,151,0)"/>
          <stop offset="35%" stop-color="rgba(61,220,151,0.75)"/>
          <stop offset="55%" stop-color="rgba(212,168,90,0.95)"/>
          <stop offset="100%" stop-color="rgba(61,220,151,0)"/>
        </linearGradient>
        <linearGradient id="briefingPulseFill-${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(61,220,151,0.18)"/>
          <stop offset="100%" stop-color="rgba(61,220,151,0)"/>
        </linearGradient>
      </defs>
      <path class="briefing-story__pulse-area" d="M0,88 C48,52 96,98 144,72 S240,48 288,68 S384,42 432,58 L480,48 L480,120 L0,120 Z" fill="url(#briefingPulseFill-${uid})"/>
      <path class="briefing-story__pulse-line" d="M0,88 C48,52 96,98 144,72 S240,48 288,68 S384,42 432,58 L480,48" fill="none" stroke="url(#briefingPulseGrad-${uid})" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="briefing-story__pulse-sweep"></div>
  </div>`;
}

function watchListHtml(watch) {
  const items = Array.isArray(watch) ? watch : watch ? [watch] : [];
  if (!items.length) return "<p>Macro calendar and market breadth.</p>";
  return `<ul class="market-summary-watch__list">${items
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("")}</ul>`;
}

/**
 * @param {object} [riskState]
 */
export function buildStoryBriefing(riskState) {
  const ctx = getIntelContext(riskState);
  const n = ctx.narrative;
  const uid = Math.random().toString(36).slice(2, 8);
  const headline = n.headline || "Today's market story";
  const whatChanged = n.whatChanged || "Pulling live market inputs…";
  const whyItMatters =
    n.whyItMatters || "Context updates as live quotes and macro data arrive.";
  const whatToWatch = n.whatToWatch || ["VIX", "Treasury yields", "Market breadth"];

  return `<article class="briefing-story briefing-story--${ctx.regimeCls}" aria-live="polite" data-risk-label="${escapeHtml(ctx.regimeShort)}">
    <div class="briefing-story__atmosphere" aria-hidden="true"></div>
    <div class="briefing-story__sweep" aria-hidden="true"></div>

    <header class="briefing-story__header">
      <span class="briefing-story__live"><span class="briefing-story__live-dot"></span>Live briefing</span>
      <span class="briefing-story__regime briefing-story__regime--${ctx.regimeCls}">${escapeHtml(ctx.regimeShort)}</span>
    </header>

    <div class="briefing-story__confidence-row" style="margin:0 0 14px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-dim)">
      <span>Confidence</span>
      <div style="flex:1;max-width:120px;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden">
        <div style="width:${ctx.confidencePct}%;height:100%;background:var(--gold)"></div>
      </div>
      <span>${escapeHtml(ctx.confidence)}</span>
    </div>

    <section class="market-summary-brief" aria-labelledby="market-summary-title">
      <h2 class="market-summary-brief__kicker" id="market-summary-title">Market Summary</h2>
      <h3 class="focus-detail__q">What am I looking at?</h3>
      <p class="market-summary-brief__intro">${escapeHtml(MARKET_SUMMARY_INTRO)}</p>
      <p class="market-summary-brief__combines">It combines:</p>
      <ul class="market-summary-brief__factors">${marketSummaryFactorsHtml()}</ul>
      <p class="market-summary-brief__closes">to explain what is driving stocks right now.</p>
    </section>

    ${renderPulseVisual(uid)}

    <section class="market-summary-story" aria-labelledby="market-story-title">
      <h2 class="market-summary-brief__kicker" id="market-story-title">Today's Market Story</h2>
      <h3 class="market-summary-story__headline">${escapeHtml(headline)}</h3>
    </section>

    <section class="market-summary-section" style="margin-top:16px">
      <h3 class="focus-detail__q">What changed</h3>
      <p class="market-summary-story__text" data-risk-what-changed>${escapeHtml(whatChanged)}</p>
    </section>

    <section class="market-summary-section" style="margin-top:12px">
      <h3 class="focus-detail__q">Why it matters</h3>
      <p class="market-summary-story__text" data-risk-why-matters>${escapeHtml(whyItMatters)}</p>
    </section>

    <footer class="briefing-story__watch">
      <span class="briefing-story__watch-label">What to watch next</span>
      <div data-risk-what-watch>${watchListHtml(whatToWatch)}</div>
    </footer>
  </article>`;
}

/** @deprecated Use buildStoryBriefing */
export const buildRichSummary = buildStoryBriefing;

export function renderMarketBriefingModule() {
  const rs = window.riskState;
  return `<div class="rail-module rail-module--briefing rail-module--story">
    <div class="wheel-briefing-body">${buildStoryBriefing(rs)}</div>
  </div>`;
}

/**
 * Patch briefing DOM in place when riskState updates.
 * @param {HTMLElement | null} root
 * @param {object} riskState
 */
export function refreshBriefingFromRiskState(root, riskState) {
  if (!root || !riskState) return;
  const body = root.querySelector(".wheel-briefing-body");
  if (!body) {
    root.innerHTML = `<div class="wheel-briefing-body">${buildStoryBriefing(riskState)}</div>`;
    bindMarketBriefing(root);
    return;
  }

  const ctx = getIntelContext(riskState);
  const n = riskState.narrative || {};
  const story = body.querySelector(".briefing-story");
  if (!story) {
    body.innerHTML = buildStoryBriefing(riskState);
    bindMarketBriefing(root);
    return;
  }

  story.className = `briefing-story briefing-story--${ctx.regimeCls} is-visible`;
  story.dataset.riskLabel = ctx.regimeShort;

  const regimeEl = story.querySelector(".briefing-story__regime");
  if (regimeEl) {
    regimeEl.textContent = ctx.regimeShort;
    regimeEl.className = `briefing-story__regime briefing-story__regime--${ctx.regimeCls}`;
  }

  const headlineEl = story.querySelector(".market-summary-story__headline");
  if (headlineEl) headlineEl.textContent = n.headline || "Today's market story";

  const changedEl = story.querySelector("[data-risk-what-changed]");
  if (changedEl) changedEl.textContent = n.whatChanged || "";

  const mattersEl = story.querySelector("[data-risk-why-matters]");
  if (mattersEl) mattersEl.textContent = n.whyItMatters || "";

  const watchEl = story.querySelector("[data-risk-what-watch]");
  if (watchEl) watchEl.innerHTML = watchListHtml(n.whatToWatch);
}

export function bindMarketBriefing(root) {
  const story = root?.querySelector(".briefing-story");
  if (!story) return;
  requestAnimationFrame(() => story.classList.add("is-visible"));
}
