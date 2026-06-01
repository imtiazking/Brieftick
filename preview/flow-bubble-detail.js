/**
 * Money Flow — beginner-friendly industry detail copy (preview).
 * @module preview/flow-bubble-detail
 */

/** @typedef {'inflow' | 'outflow' | 'neutral'} FlowDirection */

/**
 * @typedef {Object} FlowIndustryDetail
 * @property {string} name
 * @property {FlowDirection} direction
 * @property {string} directionLabel
 * @property {string} because
 * @property {string} means
 * @property {string[]} examples
 * @property {'Low' | 'Medium' | 'High'} risk
 */

/** @type {Record<string, FlowIndustryDetail>} */
export const FLOW_INDUSTRY_DETAILS = {
  technology: {
    name: "Technology",
    direction: "inflow",
    directionLabel: "Inflow",
    because:
      "Money is moving into this area because investors are betting on AI, software, and large tech companies to keep growing.",
    means:
      "For beginners: when technology leads, growth stocks often rise and major indexes can move up — but prices can still swing on news.",
    examples: ["Apple (AAPL)", "Microsoft (MSFT)", "NVIDIA (NVDA)"],
    risk: "Medium",
  },
  energy: {
    name: "Energy",
    direction: "inflow",
    directionLabel: "Inflow",
    because:
      "Money is moving into this area because oil prices are firm and investors want exposure to oil and gas companies.",
    means:
      "For beginners: energy stocks can do well when fuel prices rise, but they can fall quickly if oil prices drop.",
    examples: ["Exxon Mobil (XOM)", "Chevron (CVX)", "ConocoPhillips (COP)"],
    risk: "Medium",
  },
  financials: {
    name: "Financials",
    direction: "inflow",
    directionLabel: "Inflow",
    because:
      "Money is moving into this area because banks and lenders can benefit when the economy looks steady and interest rates are in focus.",
    means:
      "For beginners: bank stocks often follow the broader market — they can rise on good news but struggle if investors worry about loans or rates.",
    examples: ["JPMorgan (JPM)", "Bank of America (BAC)", "Goldman Sachs (GS)"],
    risk: "Medium",
  },
  industrials: {
    name: "Industrials",
    direction: "neutral",
    directionLabel: "Neutral",
    because:
      "Money is moving here at a steady pace — investors see factories, transport, and infrastructure as part of a normal growth day, not the main story.",
    means:
      "For beginners: industrial companies often move with the economy. They can join a rally but usually do not lead it.",
    examples: ["Caterpillar (CAT)", "Honeywell (HON)", "Union Pacific (UNP)"],
    risk: "Low",
  },
  defensives: {
    name: "Defensives",
    direction: "outflow",
    directionLabel: "Outflow",
    because:
      "Money is moving out of this area because investors are favouring faster-growing sectors instead of safer, slower-moving companies today.",
    means:
      "For beginners: defensive stocks (like utilities or staples) are often held for stability. When they lag, it usually means investors are taking more risk elsewhere.",
    examples: ["Procter & Gamble (PG)", "Coca-Cola (KO)", "NextEra Energy (NEE)"],
    risk: "Low",
  },
};

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} id
 * @returns {FlowIndustryDetail | null}
 */
export function getFlowIndustryDetail(id) {
  return FLOW_INDUSTRY_DETAILS[id] || null;
}

/** Empty detail panel shell — content filled on interaction. */
export function renderFlowDetailPanelShell() {
  return `<aside class="flow-bubbles-hero__detail" data-flow-detail hidden aria-hidden="true" aria-live="polite">
    <button type="button" class="flow-bubbles-hero__detail-close" data-flow-detail-close aria-label="Close industry details">×</button>
    <div class="flow-bubbles-hero__detail-body" data-flow-detail-body></div>
  </aside>`;
}

/**
 * @param {FlowIndustryDetail} detail
 * @returns {string}
 */
export function renderFlowDetailContent(detail) {
  const examples = detail.examples.map((ex) => escapeHtml(ex)).join(", ");
  return `<header class="flow-bubbles-hero__detail-head">
      <h3 class="flow-bubbles-hero__detail-title">${escapeHtml(detail.name)}</h3>
      <span class="flow-bubbles-hero__detail-flow flow-bubbles-hero__detail-flow--${detail.direction}">${escapeHtml(detail.directionLabel)}</span>
    </header>
    <p class="flow-bubbles-hero__detail-row"><span class="flow-bubbles-hero__detail-label">Why money is moving</span> ${escapeHtml(detail.because)}</p>
    <p class="flow-bubbles-hero__detail-row"><span class="flow-bubbles-hero__detail-label">What it means</span> ${escapeHtml(detail.means)}</p>
    <p class="flow-bubbles-hero__detail-row"><span class="flow-bubbles-hero__detail-label">Example companies</span> <span class="flow-bubbles-hero__detail-examples">${examples}</span></p>
    <p class="flow-bubbles-hero__detail-row flow-bubbles-hero__detail-risk"><span class="flow-bubbles-hero__detail-label">Risk level</span><span class="flow-bubbles-hero__detail-risk-val flow-bubbles-hero__detail-risk-val--${detail.risk.toLowerCase()}">${escapeHtml(detail.risk)}</span></p>`;
}
