/**
 * Premium live market briefing — wheel Summary channel (storytelling, not dashboard).
 * @module preview/dashboard-preview-briefing
 */

const PREVIEW_QUOTES = {
  SPY: { pctChange: 0.48, price: 512.2 },
  QQQ: { pctChange: 0.62, price: 445.1 },
  IWM: { pctChange: 0.08, price: 198.4 },
  NVDA: { pctChange: 1.98, price: 219.46 },
  XOM: { pctChange: 1.18, price: 118.62 },
};

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

export function initPreviewRiskState() {
  window.riskState = {
    score: 38,
    label: "Risk-On Tilt",
    confidence: "Medium",
    quotes: { ...PREVIEW_QUOTES },
  };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getIntelContext(quotes) {
  const q = { ...PREVIEW_QUOTES, ...quotes };
  const rs = window.riskState || {};
  let regimeShort = "Mixed";
  let regimeCls = "mixed";

  if (rs.score != null) {
    if (rs.score <= 36) {
      regimeShort = "Risk-On";
      regimeCls = "on";
    } else if (rs.score >= 66) {
      regimeShort = "Risk-Off";
      regimeCls = "off";
    }
  } else if (/risk-on/i.test(String(rs.label || ""))) {
    regimeShort = "Risk-On";
    regimeCls = "on";
  } else if (/risk-off/i.test(String(rs.label || ""))) {
    regimeShort = "Risk-Off";
    regimeCls = "off";
  }

  const spy = q.SPY;
  const iwm = q.IWM;
  let breadthNarrow = false;
  if (spy && iwm && !isNaN(spy.pctChange) && !isNaN(iwm.pctChange)) {
    breadthNarrow = spy.pctChange - iwm.pctChange > 0.2;
  }

  return { q, regimeShort, regimeCls, breadthNarrow };
}

/**
 * @param {ReturnType<typeof getIntelContext>} ctx
 * @returns {{ headline: string, paragraphs: string[] }}
 */
function getTodayStory(ctx) {
  if (ctx.regimeShort === "Risk-On" && ctx.breadthNarrow) {
    return {
      headline: "A Divided Session",
      paragraphs: [
        "Large technology companies are pushing markets higher, but many smaller stocks are not participating.",
        "This means the market appears strong on the surface, but strength is concentrated in a smaller group of companies.",
      ],
    };
  }
  if (ctx.regimeShort === "Risk-On") {
    return {
      headline: "Growth Holds the Tape",
      paragraphs: [
        "Investors are leaning into growth and AI-linked leadership. Major indices are moving higher with broader participation than a narrow rally.",
        "The move still depends on a few strong sectors — watch whether smaller companies keep pace.",
      ],
    };
  }
  if (ctx.regimeShort === "Risk-Off") {
    return {
      headline: "Defensive Posture Returns",
      paragraphs: [
        "Caution is showing up beneath the headline numbers. Safer areas are attracting more attention while riskier stocks lag.",
        "Sudden headlines can move prices quickly when investors are already on edge.",
      ],
    };
  }
  return {
    headline: "A Divided Session",
    paragraphs: [
      "Indices and individual stocks are not all moving the same way. Leadership in one area can hide weakness elsewhere.",
      "Read market direction, sentiment, and breadth together before assuming the whole market is strong or weak.",
    ],
  };
}

function getWatchNext(ctx) {
  if (ctx.breadthNarrow) {
    return "Whether smaller companies start catching up — narrow leadership can reverse fast if mega-caps lose momentum.";
  }
  return "CPI and mega-cap earnings are the next tests for whether this move broadens or fades.";
}

function marketSummaryFactorsHtml() {
  return MARKET_SUMMARY_FACTORS.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

/** Single immersive visual — animated market pulse wave. */
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

export function buildStoryBriefing(quotes) {
  const ctx = getIntelContext(quotes);
  const story = getTodayStory(ctx);
  const uid = Math.random().toString(36).slice(2, 8);
  const storyParagraphs = story.paragraphs
    .map((p) => `<p class="market-summary-story__text">${escapeHtml(p)}</p>`)
    .join("");

  return `<article class="briefing-story briefing-story--${ctx.regimeCls}" aria-live="polite">
    <div class="briefing-story__atmosphere" aria-hidden="true"></div>
    <div class="briefing-story__sweep" aria-hidden="true"></div>

    <header class="briefing-story__header">
      <span class="briefing-story__live"><span class="briefing-story__live-dot"></span>Live briefing</span>
      <span class="briefing-story__regime briefing-story__regime--${ctx.regimeCls}">${escapeHtml(ctx.regimeShort)}</span>
    </header>

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
      <h3 class="market-summary-story__headline">${escapeHtml(story.headline)}</h3>
      ${storyParagraphs}
    </section>

    <footer class="briefing-story__watch">
      <span class="briefing-story__watch-label">What to watch next</span>
      <p class="briefing-story__watch-text">${escapeHtml(getWatchNext(ctx))}</p>
    </footer>
  </article>`;
}

/** @deprecated Use buildStoryBriefing */
export const buildRichSummary = buildStoryBriefing;

export function renderMarketBriefingModule() {
  initPreviewRiskState();
  return `<div class="rail-module rail-module--briefing rail-module--story">
    <div class="wheel-briefing-body">${buildStoryBriefing()}</div>
  </div>`;
}

export function bindMarketBriefing(root) {
  const story = root?.querySelector(".briefing-story");
  if (!story) return;
  requestAnimationFrame(() => story.classList.add("is-visible"));
}

export { PREVIEW_QUOTES };
