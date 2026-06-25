/**
 * Intelligence Rail — static module mocks (design lab).
 *
 * Design rule: visual first · one takeaway · one optional explanation.
 * Hero chart/map on screen; text supports the visual — never a text-only surface.
 * @module preview/dashboard-rail-mocks
 */

import { renderMovesNetworkHero } from "./dashboard-moves-network.js";
import { bindMoversIntel } from "./dashboard-movers-intel.js";
import { renderNewsHero, bindNewsNarrative } from "./dashboard-news-narrative.js";
import {
  gaugeArcGeometry,
  marketMoodFromScore,
  MARKET_RISK_ABOUT,
  MOOD_STATE_GUIDE,
  MOOD_ZONES,
  moodZoneFromVix,
  vixToRiskScorePercent,
} from "./market-mood.js";
import { renderFlowDetailPanelShell } from "./flow-bubble-detail.js";

/** Design-lab fallback when live riskState is unavailable. */
export const RAIL_PULSE = {
  regime: "Neutral → Cautious",
  regimeShort: "Neutral",
  confidence: "Medium",
  narrative:
    "Live market risk engine unavailable in this preview — connect the production dashboard for live regime, yields, and breadth.",
  narrativeShort: "Loading live market risk context…",
  editorialLine: "Loading market pulse…",
  keyDriver: "Live quotes · VIX · Treasury yields",
  keyRisk: "Breadth · sector rotation · macro headlines",
  session: "Summary channel uses structured live inputs in production.",
};

export const RAIL_SECTIONS = [
  { id: "movers", label: "MOVERS", code: "01", title: "Top Movers · S&P 500", meta: "↻ 4s · mock" },
  { id: "heatmap", label: "HEATMAP", code: "02", title: "Sector Heatmap", meta: "1D %" },
  { id: "volatility", label: "MARKET RISK", code: "03", title: "Market Mood", meta: "Plain-English read · mock" },
  { id: "flows", label: "FLOWS", code: "07", title: "Market Intelligence Engine", meta: "Live capital flow" },
  { id: "signals", label: "SIGNALS", code: "06", title: "Signal Intelligence Feed", meta: "8 headlines · mock" },
  { id: "news", label: "NEWS", code: "10", title: "News Intelligence", meta: "Live ↻ 60s" },
  { id: "correlation", label: "MOVES TOGETHER", code: "09", title: "Moves Together", meta: "Who rises & falls together" },
  { id: "alerts", label: "WHAT MATTERS", code: "S1", title: "What Matters", meta: "Live · FRED / Finnhub" },
  { id: "watchlist", label: "WATCHLIST", code: "05", title: "Watchlist", meta: "Design lab book" },
  { id: "session", label: "SESSION", code: "08", title: "Today's Briefing", meta: "Live · preview" },
];

/** Plain-English wheel navigation labels (wheel only; module ids/engines unchanged) */
const WHEEL_LABELS = {
  movers: "Movers",
  heatmap: "Sectors",
  volatility: "Market Risk",
  flows: "Money Flow",
  signals: "Opportunities",
  news: "News",
  correlation: "Moves Together",
  alerts: "What Matters",
  watchlist: "Watchlist",
  session: "Summary",
};

/** Wheel channel order — same ids as RAIL_SECTIONS, investor-friendly labels */
export const WHEEL_SECTIONS = RAIL_SECTIONS.map((s) => ({
  ...s,
  label: WHEEL_LABELS[s.id] ?? s.label,
}));

const MOVERS = [
  ["NVDA", "NVIDIA", "219.46", "+1.98", 1.98],
  ["AMD", "Adv. Micro Dev.", "164.28", "−3.44", -3.44],
  ["XOM", "Exxon Mobil", "118.62", "+1.18", 1.18],
  ["META", "Meta Platforms", "568.42", "−0.84", -0.84],
  ["TSLA", "Tesla", "184.92", "−1.42", -1.42],
  ["JPM", "JPMorgan", "204.18", "+0.74", 0.74],
  ["CVX", "Chevron", "162.40", "+0.96", 0.96],
  ["AAPL", "Apple", "219.84", "+0.22", 0.22],
  ["MSFT", "Microsoft", "412.74", "−0.53", -0.53],
  ["AVGO", "Broadcom", "1386.20", "−1.18", -1.18],
];

/** Interactive sector guides — beginner-friendly copy (design lab) */
const SECTOR_GUIDES = [
  {
    id: "technology",
    name: "Technology",
    pct: 0.42,
    means:
      "Technology companies are leading the market today. This group includes software, chips, and online platforms that investors often look to for growth.",
    why:
      "Strong interest in artificial intelligence and solid earnings from big tech names are pulling money into this area. Investors see these companies as leaders in the next wave of growth.",
    examples: ["NVDA", "MSFT", "AAPL", "GOOGL"],
  },
  {
    id: "energy",
    name: "Energy",
    pct: 1.18,
    means:
      "Energy companies are doing well today. This sector covers oil, gas, and companies that produce and sell fuel.",
    why:
      "Oil prices are firm and supply concerns are keeping investors interested. When energy prices rise, these companies often benefit.",
    examples: ["XOM", "CVX", "COP", "SLB"],
  },
  {
    id: "financials",
    name: "Financials",
    pct: 0.36,
    means:
      "Banks and financial companies are slightly higher. This sector includes banks, insurers, and payment companies.",
    why:
      "A steady economy and stable interest rates are helping bank stocks. Investors feel these companies can still earn solid profits in the current environment.",
    examples: ["JPM", "BAC", "GS", "V"],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    pct: -0.18,
    means:
      "Healthcare is slightly lower today. This sector includes drug makers, hospitals, and health insurance companies.",
    why:
      "Some investors are moving money into faster-growing areas like tech. Healthcare is often seen as steadier, but it is not the main focus right now.",
    examples: ["JNJ", "UNH", "LLY", "PFE"],
  },
  {
    id: "consumer",
    name: "Consumer",
    pct: -0.44,
    means:
      "Consumer companies are a bit weaker today. This includes retailers, restaurants, and brands people buy from every day.",
    why:
      "Shoppers are being careful with spending, and some big retail names are under pressure. Investors worry that slower spending could hurt profits.",
    examples: ["AMZN", "WMT", "TGT", "NKE"],
  },
  {
    id: "industrials",
    name: "Industrials",
    pct: 0.21,
    means:
      "Industrial companies are modestly higher. This sector makes and moves physical goods — planes, trucks, factories, and equipment.",
    why:
      "A stable economy supports demand for goods and transport. Investors see these companies as tied to how busy the broader economy is.",
    examples: ["CAT", "GE", "UPS", "BA"],
  },
  {
    id: "utilities",
    name: "Utilities",
    pct: 0.63,
    means:
      "Utilities are doing better today. These companies provide electricity and gas to homes and businesses.",
    why:
      "When investors want steadier, defensive places for money, utilities often attract attention. They are seen as reliable, even when the market is uncertain.",
    examples: ["NEE", "DUK", "SO", "AEP"],
  },
  {
    id: "materials",
    name: "Materials",
    pct: -0.12,
    means:
      "Materials are slightly down. This sector includes metals, chemicals, and companies that supply raw inputs to other industries.",
    why:
      "Slower demand from factories and construction has weighed on these stocks. Investors are waiting for clearer signs that the economy will pick up speed.",
    examples: ["LIN", "FCX", "NEM", "DOW"],
  },
];

const WATCHLIST = [
  ["NVDA", "NVIDIA", "219.46", "+1.98"],
  ["MSFT", "Microsoft", "412.74", "−0.53"],
  ["AMD", "AMD", "164.28", "−3.44"],
  ["AAPL", "Apple", "219.84", "+0.22"],
  ["TSLA", "Tesla", "184.92", "−1.42"],
  ["META", "Meta", "568.42", "−0.84"],
];

/** @typedef {'high' | 'medium' | 'low'} AlertImportance */

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heatColor(v) {
  const a = Math.min(Math.abs(v) / 3, 1);
  if (v >= 0.1) return `rgba(61,220,151, ${0.15 + a * 0.7})`;
  if (v <= -0.1) return `rgba(255,91,110, ${0.15 + a * 0.7})`;
  return "rgba(255,255,255,0.04)";
}

function formatSectorPct(v) {
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

function sparkPath(seed) {
  const pts = [];
  let v = 50;
  for (let i = 0; i < 12; i++) {
    v += (seed % 7) - 3 + (i % 3) - 1;
    v = Math.max(8, Math.min(92, v));
    pts.push(v);
    seed += 1;
  }
  const w = 56;
  const h = 22;
  return pts
    .map((y, i) => `${(i / (pts.length - 1)) * w},${h - (y / 100) * (h - 2) - 1}`)
    .join(" ");
}

export function moduleHead(section, options = {}) {
  const showCode = options.showCode !== false && section.code;
  const titleInner = showCode
    ? `<b>${esc(section.code)}</b> ${esc(section.title)}`
    : esc(section.title);
  return `<header class="rail-module__head">
    <span class="rail-module__title">${titleInner}</span>
    <span class="rail-module__meta">${esc(section.meta)}</span>
  </header>`;
}

function focusDetailBlocks({ what, why, matters }) {
  return `<div class="focus-detail__block">
      <span class="focus-detail__q">What is happening?</span>
      <p>${esc(what)}</p>
    </div>
    <div class="focus-detail__block">
      <span class="focus-detail__q">Why is it happening?</span>
      <p>${esc(why)}</p>
    </div>
    <div class="focus-detail__block">
      <span class="focus-detail__q">Why does it matter?</span>
      <p>${esc(matters)}</p>
    </div>`;
}

/** Visual-first surface: hero → takeaway → optional explanation toggle. */
function renderIntelSurface(heroHtml, takeaway, explain) {
  return `<div class="rail-module rail-module--intel">
    <div class="intel-hero">${heroHtml}</div>
    <p class="intel-takeaway">${esc(takeaway)}</p>
    <button type="button" class="intel-explain-toggle" aria-expanded="false">Understand this</button>
    <article class="intel-explain" hidden>${focusDetailBlocks(explain)}</article>
  </div>`;
}

export function bindIntelExplain(root) {
  const scope = root || document;
  const modules = scope.querySelectorAll(".rail-module--intel");

  const wire = (module) => {
    const btn = module.querySelector(".intel-explain-toggle");
    const panel = module.querySelector(".intel-explain");
    if (!btn || !panel || btn.dataset.explainBound === "1") return;

    const isMarketRisk = module.classList.contains("rail-module--market-risk");
    const openLabel = isMarketRisk ? "Why?" : "Understand this";
    const closeLabel = isMarketRisk ? "Hide" : "Hide explanation";
    btn.textContent = openLabel;
    btn.dataset.explainBound = "1";

    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
      btn.textContent = open ? openLabel : closeLabel;
    });
  };

  if (modules.length) {
    modules.forEach(wire);
    return;
  }

  if (scope.classList?.contains("rail-module--intel")) wire(scope);
}

function gaugeZonePathsHtml() {
  const arcs = [
    "M 24 100 A 76 76 0 0 1 56 56",
    "M 56 56 A 76 76 0 0 1 84 47",
    "M 84 47 A 76 76 0 0 1 116 47",
    "M 116 47 A 76 76 0 0 1 144 56",
    "M 144 56 A 76 76 0 0 1 176 100",
  ];
  return MOOD_ZONES.map(
    (z, i) =>
      `<path data-zone-id="${z.id}" data-zone-vix="${z.vixAnchor}" class="live-gauge__zone" d="${arcs[i]}" fill="none" stroke="transparent" stroke-width="26" aria-label="${esc(z.label)}"/>`
  ).join("");
}

function gaugeZoneLegendHtml() {
  return MOOD_ZONES.map(
    (z) =>
      `<button type="button" class="live-gauge__zone-key" data-zone-id="${z.id}" data-zone-vix="${z.vixAnchor}" aria-label="${esc(z.label)}">${esc(z.label)}</button>`
  ).join("");
}

function moodListHtml(items) {
  return `<ul class="market-mood-list">${items.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
}

function formatFredVixAsOf(iso) {
  if (!iso) return "As of —";
  try {
    const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
    return `As of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  } catch {
    return `As of ${iso}`;
  }
}

function heroVolatilityGauge() {
  const rs = typeof window !== "undefined" ? window.riskState : null;
  const needleVix = rs?.gaugeVix ?? 18;
  const moodId = rs?.moodId ?? moodZoneFromVix(needleVix).id;
  const mood = moodZoneFromVix(needleVix);
  const label = rs?.label || "Loading…";
  const compositeScore =
    rs?.score != null && !Number.isNaN(rs.score) ? Math.round(rs.score) : "—";
  const riskPct = vixToRiskScorePercent(needleVix);
  const geom = gaugeArcGeometry(needleVix);
  const vixDisplay = rs?.vix != null ? rs.vix.toFixed(1) : "—";
  const vixAsOf = formatFredVixAsOf(
    typeof window !== "undefined" ? window._vixFredDate : null
  );
  const ariaNow =
    rs?.score != null && !Number.isNaN(rs.score) ? Math.round(rs.score) : riskPct.toFixed(0);
  return `<div class="live-chart live-gauge" data-vix="${needleVix}" data-composite-score="${compositeScore}" data-mood="${moodId}" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ariaNow}" aria-label="Market risk gauge · composite score ${compositeScore} · ${esc(label)}">
    <svg class="live-gauge__svg" viewBox="0 0 200 120" aria-label="Interactive market mood gauge">
      <path class="live-gauge__track" d="M 24 100 A 76 76 0 0 1 176 100" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" stroke-linecap="round"/>
      <path class="live-gauge__fill" d="M 24 100 A 76 76 0 0 1 176 100" fill="none" stroke="url(#gaugeGrad)" stroke-width="8" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="calc(100 - var(--gauge-fill, 35))"/>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#3ddc97"/>
          <stop offset="55%" stop-color="#e8c178"/>
          <stop offset="100%" stop-color="#ff5b6e"/>
        </linearGradient>
        <filter id="gaugeMarkerGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <circle class="live-gauge__hit" cx="100" cy="100" r="76" fill="transparent"/>
      <g class="live-gauge__needle">
        <line class="live-gauge__needle-line" x1="${geom.needleX1}" y1="${geom.needleY1}" x2="${geom.needleX2.toFixed(2)}" y2="${geom.needleY2.toFixed(2)}" stroke="#f0d9a8" stroke-width="3.5" stroke-linecap="round"/>
        <circle class="live-gauge__needle-hub" cx="100" cy="100" r="7" fill="#0a0d14" stroke="#d4a85a" stroke-width="2.5"/>
      </g>
      <circle class="live-gauge__marker" cx="${geom.markerX.toFixed(2)}" cy="${geom.markerY.toFixed(2)}" r="6" fill="${mood.color}" stroke="#fff" stroke-width="2" filter="url(#gaugeMarkerGlow)"/>
      <g class="live-gauge__zones">${gaugeZonePathsHtml()}</g>
    </svg>
    <div class="live-gauge__headline" aria-live="polite">
      <span class="live-gauge__headline-kicker">Market Risk</span>
      <strong class="live-gauge__composite-score gauge-composite-value" data-composite-score>${esc(String(compositeScore))}</strong>
      <span class="live-gauge__composite-label">Composite Risk Score</span>
      <strong class="live-gauge__headline-mood" data-mood-label>${esc(label)}</strong>
      <span class="live-gauge__headline-zone" data-mood-zone>Regime · needle reflects composite score</span>
    </div>
    <div class="live-gauge__zone-legend" data-zone-legend role="group" aria-label="Mood zones">
      ${gaugeZoneLegendHtml()}
    </div>
    <p class="live-gauge__zone-tip" data-zone-tip hidden></p>
    <div class="live-gauge__rating" aria-live="polite">
      <p class="live-gauge__rating-row live-gauge__rating-row--score">
        <span class="live-gauge__rating-label">Composite Risk Score</span>
        <strong class="live-gauge__rating-score"><span class="gauge-composite-value live-gauge__value">${esc(String(compositeScore))}</span><span class="gauge-composite-suffix">/100</span></strong>
      </p>
      <p class="live-gauge__rating-row live-gauge__rating-row--regime">
        <span class="live-gauge__rating-label">Regime</span>
        <strong class="live-gauge__regime" data-mood-label-regime>${esc(label)}</strong>
      </p>
      <p class="live-gauge__rating-row live-gauge__rating-row--vix-secondary">
        <span class="live-gauge__rating-label">VIX (FRED Close)</span>
        <strong class="live-gauge__vix-secondary"><span class="gauge-vix-value">${esc(vixDisplay)}</span></strong>
        <span class="live-gauge__vix-asof" data-vix-asof>${esc(vixAsOf)}</span>
      </p>
      <p class="live-gauge__rating-row">
        <span class="live-gauge__rating-label">Confidence Level</span>
        <strong class="live-gauge__confidence" data-mood-confidence>${esc(rs?.confidence || mood.confidence)}</strong>
      </p>
    </div>
    <p class="live-chart__hint">Drag the dial or hover the gauge for mood zones</p>
  </div>`;
}

/**
 * Packed-orbit layout (% within centered cluster box) — inset from edges for safe stage padding.
 *        Industrials
 *  Technology    Defensives
 *    Financials  Energy
 */
const CAPITAL_FLOW_BUBBLES = [
  { id: "technology", label: "Technology", pct: 38, x: 50, y: 50, delay: 0 },
  { id: "industrials", label: "Industrials", pct: 11, x: 50, y: 16, delay: 3 },
  { id: "defensives", label: "Defensives", pct: 8, x: 74, y: 38, delay: 4, outflow: true },
  { id: "financials", label: "Financials", pct: 14, x: 26, y: 74, delay: 2 },
  { id: "energy", label: "Energy", pct: 22, x: 72, y: 72, delay: 1 },
];

const FLOW_CLUSTER_CENTER = { x: 50, y: 50 };

/** ~17% smaller than prior min/max for a more spacious stage. */
const FLOW_BUBBLE_SIZE = { min: 46, max: 146 };

const FLOW_STORY_DEFAULT = {
  primary: "Technology attracts the largest share of capital today.",
  secondary: "Energy and Financials continue to participate while Defensives lag.",
};

function flowBubbleDiameter(pct) {
  const maxPct = Math.max(...CAPITAL_FLOW_BUBBLES.map((b) => b.pct));
  const t = pct / maxPct;
  return Math.round(FLOW_BUBBLE_SIZE.min + t * (FLOW_BUBBLE_SIZE.max - FLOW_BUBBLE_SIZE.min));
}

function flowBubbleTier(id) {
  const sorted = [...CAPITAL_FLOW_BUBBLES].sort((a, b) => b.pct - a.pct);
  return sorted.findIndex((b) => b.id === id) + 1;
}

function heroFlowMap() {
  const bubbles = CAPITAL_FLOW_BUBBLES.map((b) => {
    const size = flowBubbleDiameter(b.pct);
    const tier = flowBubbleTier(b.id);
    const leaderCls = tier === 1 ? " is-leader" : "";
    const outCls = b.outflow ? " is-outflow" : "";
    return `<button
      type="button"
      class="flow-bubble flow-bubble--tier-${tier}${leaderCls}${outCls}"
      data-flow-id="${esc(b.id)}"
      data-flow-pct="${b.pct}"
      data-anchor-x="${b.x}"
      data-anchor-y="${b.y}"
      style="--size:${size}px;--x:${b.x}%;--y:${b.y}%;--delay:${b.delay};--pct:${b.pct};--tier:${tier}"
      aria-label="${esc(b.label)}, ${b.pct} percent of capital flow"
    >
      <span class="flow-bubble__halo" aria-hidden="true"></span>
      <span class="flow-bubble__drift" aria-hidden="true">
        <span class="flow-bubble__sphere">
          <span class="flow-bubble__pct">${b.pct}%</span>
          <span class="flow-bubble__label">${esc(b.label)}</span>
        </span>
      </span>
    </button>`;
  }).join("");

  return `<div class="live-chart flow-bubbles-hero" aria-label="Money flow — capital concentration">
    <div class="flow-bubbles-hero__env" aria-hidden="true">
      <span class="flow-bubbles-hero__mist"></span>
      <span class="flow-bubbles-hero__floor"></span>
    </div>
    <div class="flow-bubbles-hero__canvas" role="img" aria-label="Capital flowing toward Technology, Energy, Financials, Industrials, and Defensives">
      <div class="flow-bubbles-hero__split">
        <div class="flow-bubbles-hero__stage">
          <button type="button" class="flow-bubbles-hero__stage-hit" aria-label="View capital flow composition"></button>
          <div class="flow-bubbles-hero__cluster">${bubbles}</div>
        </div>
        ${renderFlowDetailPanelShell()}
      </div>
    </div>
    <div class="flow-bubbles-hero__story" aria-live="polite">
      <p class="flow-bubbles-hero__story-primary">${FLOW_STORY_DEFAULT.primary}</p>
      <p class="flow-bubbles-hero__story-secondary">${FLOW_STORY_DEFAULT.secondary}</p>
    </div>
  </div>`;
}

function heroSignalPulse() {
  const bars = [
    { key: "interest-rates", label: "Interest Rates", h: 72, delay: 0 },
    { key: "technology", label: "Technology", h: 88, delay: 1 },
    { key: "market-strength", label: "Market Strength", h: 38, delay: 2 },
    { key: "energy", label: "Energy", h: 64, delay: 3 },
  ];
  const maxH = Math.max(...bars.map((b) => b.h));
  const leader = bars.find((b) => b.h === maxH) || bars[0];

  const cols = bars
    .map((b) => {
      const isLeader = b.h === maxH;
      return `<button type="button" class="signal-bar${isLeader ? " is-leader" : ""}" data-signal="${esc(b.key)}" style="--h:${b.h}%;--delay:${b.delay}" aria-label="${esc(b.label)} — ${b.h} opportunity strength">
        <span class="signal-bar__value">${b.h}</span>
        <span class="signal-bar__track">
          <span class="signal-bar__fill"></span>
          <span class="signal-bar__sheen" aria-hidden="true"></span>
          <span class="signal-bar__glow" aria-hidden="true"></span>
        </span>
        <span class="signal-bar__ripple" aria-hidden="true"></span>
        <span class="signal-bar__label">${esc(b.label)}</span>
      </button>`;
    })
    .join("");

  return `<div class="live-chart signal-pulse-hero" aria-label="Opportunities — what is driving the tape today">
    <p class="signal-pulse-hero__kicker">Driving opportunities today</p>
    <div class="signal-pulse-hero__chart">${cols}</div>
    <p class="signal-pulse-hero__lead"><span class="signal-pulse-hero__lead-name">${esc(leader.label)}</span> is leading the tape</p>
    <p class="live-chart__hint">Tap a bar to explore</p>
    <p class="live-chart__probe" aria-live="polite"></p>
  </div>`;
}

function heroNewsTimeline() {
  const nodes = [
    ["CPI", "cpi"],
    ["AI supply", "ai supply"],
    ["Europe", "europe"],
    ["Oil", "oil"],
  ];
  const dots = nodes
    .map(
      ([label, key], i) =>
        `<button type="button" class="news-timeline__node${i === 0 ? " is-active" : ""}" data-news="${esc(key)}">${esc(label)}</button>`
    )
    .join("");
  return `<div class="live-chart news-timeline-hero" aria-label="News timeline — tap to scrub">
    <div class="news-timeline__track"><span class="news-timeline__pulse"></span></div>
    <div class="news-timeline__nodes">${dots}</div>
    <p class="live-chart__hint">Scrub the headline cycle</p>
    <p class="live-chart__probe" aria-live="polite"></p>
  </div>`;
}

function heroConnectedMarkets() {
  const edges = MOVES_EDGES.map((edge, i) => {
    return `<g
      class="moves-edge moves-edge--${edge.strength}${i === 0 ? " is-active" : ""}"
      data-moves-edge="${esc(edge.id)}"
      data-from="${esc(edge.from)}"
      data-to="${esc(edge.to)}"
      data-headline="${esc(edge.headline)}"
      data-why="${esc(edge.why)}"
      data-badge="${esc(edge.badge)}"
      data-strength="${esc(edge.strength)}"
      role="button"
      tabindex="0"
      aria-label="${esc(edge.headline)}"
    >
      <path class="moves-edge__glow" d="${edge.d}" pathLength="100"/>
      <path class="moves-edge__line" d="${edge.d}" pathLength="100"/>
    </g>`;
  }).join("");

  const nodes = MOVES_NODES.map((node, i) => {
    const active = i === 0 || i === 1 ? " is-active" : "";
    return `<button
      type="button"
      class="moves-node${active}"
      data-moves-node="${esc(node.id)}"
      style="left:${node.left};top:${node.top}"
      aria-label="${esc(node.sym)} — ${esc(node.name)}"
    >
      <span class="moves-node__sym">${esc(node.sym)}</span>
      <span class="moves-node__name">${esc(node.name)}</span>
    </button>`;
  }).join("");

  const first = MOVES_EDGES[0];

  return `<div class="live-chart moves-together-hero" aria-label="Moves Together — market connections">
    <div class="moves-together__canvas">
      <svg class="moves-together__svg" viewBox="0 0 400 220" aria-hidden="true">${edges}</svg>
      <div class="moves-together__nodes">${nodes}</div>
    </div>
    <article class="moves-together__detail">
      <h3 class="moves-together__headline">${esc(first.headline)}</h3>
      <p class="moves-together__why">${esc(first.why)}</p>
      <span class="moves-together__badge moves-together__badge--${first.strength === "strong" ? "strong" : "moderate"}">${esc(first.badge)}</span>
    </article>
    <p class="live-chart__hint">Tap a glowing line or company — strongest links pulse brightest</p>
    <p class="live-chart__probe" aria-live="polite"></p>
  </div>`;
}

function heroAlertsStackShell() {
  return `<p class="what-matters__source" data-what-matters-source>Live · FRED / Finnhub</p>
    <div class="what-matters__stack" data-what-matters-stack>
      <p class="what-matters__loading">Loading live market calendar…</p>
    </div>
    <p class="what-matters__refreshed" data-what-matters-refreshed aria-live="polite"></p>`;
}

function heroSessionChart() {
  const w = 320;
  const h = 72;
  const path = sparkPath(42)
    .split(" ")
    .map((p, i) => {
      const [x, y] = p.split(",").map(Number);
      const nx = (x / 56) * w;
      const ny = (y / 22) * h;
      return `${i === 0 ? "M" : "L"}${nx.toFixed(1)},${ny.toFixed(1)}`;
    })
    .join(" ");
  return `<div class="session-chart-hero">
    <div class="session-chart-hero__regime"><span class="session-chart-hero__pill">Risk-On</span><span class="session-chart-hero__breadth">Narrow breadth</span></div>
    <svg class="session-chart-hero__svg" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <defs><linearGradient id="sessionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(61,220,151,0.35)"/><stop offset="100%" stop-color="rgba(61,220,151,0)"/></linearGradient></defs>
      <path d="${path} L${w},${h} L0,${h} Z" fill="url(#sessionFill)"/>
      <path d="${path}" fill="none" stroke="#3ddc97" stroke-width="2"/>
    </svg>
  </div>`;
}

function moverSparkMarkup(sym, dir, seed) {
  const color = dir === "up" ? "#3ddc97" : dir === "dn" ? "#ff5b6e" : "#5a6577";
  const points = sparkPath(seed);
  return `<svg class="mover-row__spark" viewBox="0 0 56 22" preserveAspectRatio="none" aria-hidden="true"><polyline class="mover-row__spark-line" points="${points}" pathLength="100" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderMovers(section) {
  const rows = MOVERS.map(([s, n, p, c, d], i) => {
    const dir = d > 0 ? "up" : d < 0 ? "dn" : "flat";
    const spark = moverSparkMarkup(s, dir, d * 3 + s.length);
    const active = i === 0 ? " is-active" : "";
    return `<button
      type="button"
      class="mover-row mover-row--${dir}${active}"
      data-mover-sym="${esc(s)}"
      data-mover-dir="${dir}"
      data-mover-chg="${esc(c)}%"
      aria-selected="${i === 0 ? "true" : "false"}"
      style="--row-i:${i}"
    >
      <span class="mover-row__glow" aria-hidden="true"></span>
      <span class="mover-row__sym">${esc(s)}</span>
      <span class="mover-row__name">${esc(n)}</span>
      ${spark}
      <span class="mover-row__price">${esc(p)}</span>
      <span class="mover-row__chg mover-row__chg--${dir}">${esc(c)}%</span>
    </button>`;
  }).join("");

  const first = MOVERS[0];
  const firstDir = first[4] > 0 ? "up" : first[4] < 0 ? "dn" : "flat";
  const firstSpark = moverSparkMarkup(first[0], firstDir, first[4] * 3 + first[0].length);

  return `<div class="rail-module rail-module--movers">
    ${moduleHead(section)}
    <div class="movers-intel" data-active-sym="${esc(first[0])}">
      <div class="movers-intel__ambience" aria-hidden="true">
        <span class="movers-intel__sweep"></span>
        <span class="movers-intel__bloom"></span>
        <span class="movers-intel__depth"></span>
      </div>
      <div class="movers-intel__layout">
        <div class="movers-intel__list" role="list">${rows}</div>
        <aside class="movers-intel__story is-visible" aria-live="polite">
          <div class="movers-intel__story-inner">
            <div class="movers-intel__hero">
              <span class="movers-intel__hero-bloom" aria-hidden="true"></span>
              <div class="movers-intel__hero-spark">${firstSpark}</div>
              <div class="movers-intel__hero-meta">
                <span class="movers-intel__hero-sym">${esc(first[0])}</span>
                <span class="movers-intel__hero-chg movers-intel__hero-chg--${firstDir}">${esc(first[3])}%</span>
              </div>
            </div>
            <p class="movers-intel__lead">AI infrastructure demand continues to support semiconductor leadership.</p>
            <p class="movers-intel__why"><span class="movers-intel__why-label">Why it matters:</span> <span class="movers-intel__why-text">NVDA remains the strongest signal in the AI trade.</span></p>
          </div>
        </aside>
      </div>
    </div>
  </div>`;
}

function renderSectorCard(sector) {
  const v = sector.pct;
  const dir = v > 0.05 ? "up" : v < -0.05 ? "dn" : "flat";
  const bg = heatColor(v);
  const chips = sector.examples.map((t) => `<span class="sector-card__ticker">${esc(t)}</span>`).join("");
  const head = `<span class="sector-card__head">
      <span class="sector-card__name">${esc(sector.name)}</span>
      <span class="sector-card__pct">${formatSectorPct(v)}</span>
    </span>`;
  const detailInner = `${focusDetailBlocks({
    what: sector.means,
    why: sector.why,
    matters: `Examples you may hear today: ${sector.examples.join(", ")}.`,
  })}<div class="sector-card__tickers">${chips}</div>`;

  return `<button type="button" class="sector-card sector-card--${dir}" data-sector-id="${esc(sector.id)}" aria-expanded="false">
    <span class="sector-card__flip">
      <span class="sector-card__face sector-card__face--front" style="background:${bg}">
        ${head}
        <div class="sector-card__detail">${detailInner}</div>
      </span>
      <span class="sector-card__face sector-card__face--back" style="background:${bg}">
        ${head}
        <div class="sector-card__detail sector-card__detail--focused">${detailInner}</div>
      </span>
    </span>
  </button>`;
}

function renderHeatmap() {
  const cards = SECTOR_GUIDES.map(renderSectorCard).join("");
  return `<div class="rail-module rail-module--intel rail-module--sectors">
    <div class="intel-hero intel-hero--flush">
      <div class="sector-grid" role="group" aria-label="Sector heatmap">${cards}</div>
    </div>
    <p class="intel-takeaway">Technology and energy lead the tape; most other sectors are only moving slightly.</p>
    <p class="intel-hint">Tap a tile — heat responds · one story opens at a time</p>
    <p class="live-chart__probe sector-probe" aria-live="polite">Explore sector leadership on the heatmap.</p>
  </div>`;
}

/** Wire flip + click-to-expand on sector cards (call after heatmap HTML is injected). */
export function bindSectorHeatmap(root) {
  const grid = (root || document).querySelector(".sector-grid");
  if (!grid) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  grid.querySelectorAll(".sector-card").forEach((card) => {
    card.addEventListener("click", () => {
      const wasOpen = card.classList.contains("is-expanded");

      if (!finePointer.matches && !wasOpen) {
        const wasFlipped = card.classList.contains("is-flipped");
        if (!wasFlipped) {
          grid.querySelectorAll(".sector-card").forEach((c) => c.classList.remove("is-flipped"));
          card.classList.add("is-flipped");
          return;
        }
        card.classList.remove("is-flipped");
      }

      const opening = !wasOpen;
      grid.querySelectorAll(".sector-card").forEach((c) => {
        c.classList.remove("is-expanded", "is-flipped");
        c.setAttribute("aria-expanded", "false");
      });
      grid.classList.remove("has-focus");
      if (opening) {
        card.classList.add("is-expanded");
        card.setAttribute("aria-expanded", "true");
        grid.classList.add("has-focus");
        const probe = (root || document).querySelector(".sector-probe");
        const name = card.querySelector(".sector-card__name");
        if (probe && name) probe.textContent = `${name.textContent} — open for the full story.`;
      } else {
        const probe = (root || document).querySelector(".sector-probe");
        if (probe) probe.textContent = "Explore sector leadership on the heatmap.";
      }
    });
  });
}

function marketRiskMeansHtml(means) {
  return moodListHtml(means);
}

function marketRiskWhyHtml(why) {
  return `<ul class="market-mood-why">${why.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
}

function marketRiskStatesHtml() {
  return `<ul class="market-mood-states">${MOOD_STATE_GUIDE.map(
    (s) =>
      `<li><span class="market-mood-states__badge" aria-hidden="true">${s.emoji}</span> <b>${esc(s.label)}</b> — ${esc(s.text)}</li>`
  ).join("")}</ul>`;
}

/** Visual-first Market Risk surface — mood gauge, plain-English education, optional Why. */
function renderMarketRiskSurface(heroHtml, mood) {
  return `<div class="rail-module rail-module--intel rail-module--market-risk" data-mood="${mood.id}">
    <div class="intel-hero">${heroHtml}</div>
    <section class="market-risk-summary" aria-labelledby="market-risk-about-title">
      <h3 class="focus-detail__q" id="market-risk-about-title">About Market Risk</h3>
      <p class="market-risk-summary__about">${esc(MARKET_RISK_ABOUT)}</p>
      <h3 class="focus-detail__q market-risk-summary__current-title">Current Summary</h3>
        <p class="market-risk-summary__current live-chart__probe" data-mood-summary aria-live="polite">${esc((typeof window !== "undefined" && window.riskState?.narrative?.summary) || mood.summary || mood.probe)}</p>
    </section>
    <section class="market-mood-plain" aria-labelledby="market-mood-plain-title">
      <h3 class="focus-detail__q" id="market-mood-plain-title">In plain English</h3>
      <p class="market-mood-plain__text" data-mood-plain>${esc(mood.plainEnglish)}</p>
    </section>
    <section class="market-risk-means" aria-labelledby="market-risk-means-title">
      <h3 class="focus-detail__q" id="market-risk-means-title">What This Usually Means</h3>
      <div data-mood-usually>${marketRiskMeansHtml(mood.usuallyMeans)}</div>
    </section>
    <section class="market-mood-investors" aria-labelledby="market-mood-investors-title">
      <h3 class="focus-detail__q" id="market-mood-investors-title">What Investors Typically Do</h3>
      <p class="market-mood-disclaimer">Examples only — not financial advice.</p>
      <div data-mood-investors>${moodListHtml(mood.investorsDo)}</div>
    </section>
    <button type="button" class="intel-explain-toggle" aria-expanded="false">Why?</button>
    <article class="intel-explain" hidden>
      <div class="focus-detail__block">
        <span class="focus-detail__q">Why?</span>
        ${marketRiskWhyHtml(mood.why)}
      </div>
      <div class="focus-detail__block">
        <span class="focus-detail__q">The five mood zones</span>
        ${marketRiskStatesHtml()}
      </div>
    </article>
  </div>`;
}

const FLOWS_EXPLAIN = {
  what: "Technology attracts the largest share of capital today.",
  why: "Energy and Financials continue to participate while Defensives lag — bubble size shows the order of attraction.",
  matters: "One glance at the map tells you where money is going without reading flow tables.",
};

const SIGNALS_EXPLAIN = {
  what: "Technology is dominating today's opportunity set — rates, energy, and weak breadth follow.",
  why: "Mega-cap earnings and AI positioning concentrate upside; the average stock still lags.",
  matters: "The bars show where desks are leaning — size conviction to what is actually driving the tape.",
};

const NEWS_EXPLAIN = {
  what: "Plain English explains what is moving markets, why it matters, which areas are affected, and what to watch next.",
  why: "You should not need investing experience to understand the biggest story in under five seconds.",
  matters: "FORGENIQ interprets the market for you — it does not dump headlines or jargon.",
};

const MOVES_TOGETHER_EXPLAIN = {
  what: "One name is leading the session — the ring shows who is moving with it.",
  why: "When a market leader runs, related chips, ETFs, and peers often react in the same direction.",
  matters: "You see influence before you read a number — leadership and reaction are visible at a glance.",
};

const ALERTS_EXPLAIN = {
  what: "Dated macro releases and mega-cap earnings that can move rates, sectors, and index leadership.",
  why: "Each card is sourced from FRED or Finnhub — no static templates.",
  matters: "Tap a card to focus on it, then use Learn more for a fuller explanation without jargon.",
};

const SESSION_EXPLAIN = {
  what: "US indices hold a risk-on tone with narrow tech and energy leadership.",
  why: "Earnings resilience outweighs soft patches elsewhere; breadth only partly confirms the move.",
  matters: "Strength is real but concentrated — CPI and mega-cap earnings are the next tests.",
};

function renderVolatility() {
  const mood = moodZoneFromVix(12.2);
  return renderMarketRiskSurface(heroVolatilityGauge(), mood);
}

function renderFlows() {
  return renderIntelSurface(
    heroFlowMap(),
    "Technology attracts the largest share of capital today. Energy and Financials participate; Defensives lag.",
    FLOWS_EXPLAIN
  );
}

function renderSignals() {
  return renderIntelSurface(
    heroSignalPulse(),
    "Technology is driving today's opportunities — interest rates and energy follow; market strength lags.",
    SIGNALS_EXPLAIN
  );
}

function renderNews() {
  return renderIntelSurface(
    renderNewsHero(),
    "Inflation is today's biggest story — higher prices are pushing interest rates and weighing on technology stocks.",
    NEWS_EXPLAIN
  );
}

function renderCorrelation() {
  return renderIntelSurface(
    renderMovesNetworkHero(),
    "Tap any name on the ring to see who it influences — the centre becomes your leader.",
    MOVES_TOGETHER_EXPLAIN
  );
}

function renderAlerts(section) {
  return `<div class="rail-module rail-module--intel rail-module--what-matters" data-wheel-id="alerts">
    <header class="rail-module__head">
      <span class="rail-module__title"><b>${esc(section.code)}</b> ${esc(section.title)}</span>
      <span class="rail-module__meta">${esc(section.meta)}</span>
      <span data-dash-live-badge></span>
    </header>
    <div class="intel-hero">
      <div class="live-chart alerts-stack-hero" data-what-matters-root>
        ${heroAlertsStackShell()}
        <p class="live-chart__hint">Tap a card to focus · Learn more for the full story</p>
        <p class="live-chart__probe" aria-live="polite"></p>
      </div>
    </div>
    <p class="intel-takeaway">Loading live market calendar…</p>
    <button type="button" class="intel-explain-toggle" aria-expanded="false">Understand this</button>
    <article class="intel-explain" hidden>${focusDetailBlocks(ALERTS_EXPLAIN)}</article>
  </div>`;
}

function renderWatchlist(section) {
  const rows = WATCHLIST.map(([s, n, p, c]) => {
    const cls = c.startsWith("+") ? "up" : "dn";
    return `<div class="watch-row">
      <div class="sym">${esc(s)}</div>
      <div class="name">${esc(n)}</div>
      <div class="price">${esc(p)}</div>
      <div class="chg ${cls}">${esc(c)}%</div>
    </div>`;
  }).join("");
  return `<div class="rail-module">${moduleHead(section)}${rows}
    <p class="intel-surface__note" style="margin-top:14px">Open the <b style="color:#d4a85a">Summary</b> channel on the Intelligence Wheel for today's briefing.</p>
  </div>`;
}

function renderRisk(section) {
  return `<div class="rail-module">${moduleHead({ ...section, code: "04", title: "Risk Regime", meta: "Heuristic · mock" })}
    <div class="risk-bar"><div class="risk-needle" style="left:62%"></div></div>
    <div class="risk-labels"><span>Risk-On</span><span>Neutral</span><span>Risk-Off</span></div>
    <div class="risk-state">MODERATE RISK-ON</div>
    <div class="risk-components">
      <div class="risk-component"><span>Volatility</span><div class="risk-component-track"><div class="risk-component-fill" style="width:38%"></div></div><span>38</span></div>
      <div class="risk-component"><span>Momentum</span><div class="risk-component-track"><div class="risk-component-fill" style="width:68%"></div></div><span>68</span></div>
      <div class="risk-component"><span>Sectors</span><div class="risk-component-track"><div class="risk-component-fill" style="width:55%"></div></div><span>55</span></div>
      <div class="risk-component"><span>News Stress</span><div class="risk-component-track"><div class="risk-component-fill" style="width:42%"></div></div><span>42</span></div>
    </div>
    <div class="vix-explain" style="margin-top:14px"><b style="color:#d4a85a">FORGENIQ read:</b> Equities hold firm while vol markets price event risk. Credit spreads calm; front-end yields anchor the tape. Primary risk is breadth, not level.</div>
  </div>`;
}

function renderSession() {
  return renderIntelSurface(heroSessionChart(), RAIL_PULSE.narrativeShort, SESSION_EXPLAIN);
}

/** Wire progressive disclosure after a visual intelligence module is injected. */
export function bindIntelligenceModule(root, id) {
  if (id === "heatmap") {
    bindSectorHeatmap(root);
    return;
  }
  if (id === "movers") {
    bindMoversIntel(root);
    return;
  }
  if (id === "news") {
    bindNewsNarrative(root);
    bindIntelExplain(root);
    return;
  }
  bindIntelExplain(root);
}

const RENDERERS = {
  movers: renderMovers,
  heatmap: renderHeatmap,
  volatility: renderVolatility,
  flows: renderFlows,
  signals: renderSignals,
  news: renderNews,
  correlation: renderCorrelation,
  alerts: renderAlerts,
  watchlist: renderWatchlist,
  risk: renderRisk,
  session: renderSession,
};

export function renderRailModule(id) {
  const section = WHEEL_SECTIONS.find((s) => s.id === id);
  if (!section) return "";
  const fn = RENDERERS[id];
  return fn ? fn(section) : "";
}

export function renderRailPulseHero() {
  const p = RAIL_PULSE;
  return `
    <span class="rail-pulse__tag">Market Pulse</span>
    <div class="rail-pulse__regime-row">
      <span class="rail-pulse__regime">${esc(p.regime)}</span>
      <span class="rail-pulse__confidence">Confidence ${esc(p.confidence)}</span>
    </div>
    <p class="rail-pulse__narrative">${esc(p.narrative)}</p>
    <div class="rail-pulse__drivers">
      <div class="rail-pulse__driver">
        <span class="rail-pulse__driver-label">Key driver</span>
        <p>${esc(p.keyDriver)}</p>
      </div>
      <div class="rail-pulse__driver rail-pulse__driver--risk">
        <span class="rail-pulse__driver-label">Key risk</span>
        <p>${esc(p.keyRisk)}</p>
      </div>
    </div>
    <footer class="rail-pulse__session">
      <span class="rail-pulse__session-label">Session Summary</span>
      <p>${esc(p.session)}</p>
    </footer>`;
}

export function renderWheelPulseStrip() {
  const rs = typeof window !== "undefined" ? window.riskState : null;
  const line =
    rs?.narrative?.pulseLine ||
    rs?.label ||
    RAIL_PULSE.editorialLine ||
    "Loading market pulse…";
  const tag = rs
    ? `Market Pulse · ${rs.label} · ${rs.confidence || "Medium"} confidence`
    : "Market Pulse";
  return `
    <span class="wheel-pulse-strip__tag">${esc(tag)}</span>
    <p class="wheel-pulse-strip__headline">${esc(line)}</p>`;
}
