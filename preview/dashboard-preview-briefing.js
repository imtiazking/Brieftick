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

function getHeadline(ctx) {
  if (ctx.regimeShort === "Risk-On" && ctx.breadthNarrow) return "AI Leadership Dominates";
  if (ctx.regimeShort === "Risk-On") return "Growth Holds the Tape";
  if (ctx.regimeShort === "Risk-Off") return "Defensive Posture Returns";
  return "A Divided Session";
}

function getNarrative(ctx) {
  if (ctx.regimeShort === "Risk-On" && ctx.breadthNarrow) {
    return "Megacap tech is carrying the index while the broader market only partly follows. The move looks strong on the surface — participation remains thin.";
  }
  if (ctx.regimeShort === "Risk-On") {
    return "Investors are leaning into growth and AI-linked leadership. Breadth is holding enough to support the rally — for now.";
  }
  if (ctx.regimeShort === "Risk-Off") {
    return "Caution is showing up beneath the headline numbers. Defensive rotation and softer breadth suggest the tape can turn quickly on macro surprises.";
  }
  return "Indices and internals are not telling the same story. Read leadership and breadth together before sizing risk.";
}

function getWatchNext(ctx) {
  if (ctx.breadthNarrow) {
    return "Whether small caps start catching up — narrow leadership can reverse fast if mega-caps lose momentum.";
  }
  return "CPI and mega-cap earnings are the next tests for whether this move broadens or fades.";
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
  const uid = Math.random().toString(36).slice(2, 8);

  return `<article class="briefing-story briefing-story--${ctx.regimeCls}" aria-live="polite">
    <div class="briefing-story__atmosphere" aria-hidden="true"></div>
    <div class="briefing-story__sweep" aria-hidden="true"></div>

    <header class="briefing-story__header">
      <span class="briefing-story__live"><span class="briefing-story__live-dot"></span>Live briefing</span>
      <span class="briefing-story__regime briefing-story__regime--${ctx.regimeCls}">${escapeHtml(ctx.regimeShort)}</span>
    </header>

    <h2 class="briefing-story__headline">${escapeHtml(getHeadline(ctx))}</h2>

    <p class="briefing-story__narrative">${escapeHtml(getNarrative(ctx))}</p>

    ${renderPulseVisual(uid)}

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
