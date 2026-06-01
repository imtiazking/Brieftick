/**
 * Historical pattern matching (extracted from index.html WIM).
 * @module preview/ticker-deep-dive/wim-patterns
 */

import { genSeries, spark } from "./wim-charts.js";
import { getWimEntry, getContagionPeers } from "./wim-data.js";
import { inferSectorTemplate } from "./ticker-meta.js";

const historicalPatternLibrary = [
  {
    id: "ai-capex-mar25",
    date: "Mar 2025",
    title: "AI capex pause headline",
    tags: ["ai-capex", "semis", "growth", "reaction-chain"],
    symbols: ["NVDA", "AMD", "AVGO", "MU", "SOXX"],
    regime: "Risk-off tilt",
    catalyst: "Hyperscaler commentary suggested a temporary datacentre order pause.",
    outcomes: { d1: "-2.4%", d5: "-5.8%", d20: "+1.6%" },
    recovery: "Recovered in 14 sessions",
    whySimilar: "AI infrastructure demand uncertainty hit the same semiconductor basket.",
    whyDifferent: "Policy backdrop was calmer and VIX was lower than today.",
  },
  {
    id: "rates-oct24",
    date: "Oct 2024",
    title: "Yield spike + growth de-rate",
    tags: ["rates", "growth", "qqq", "duration"],
    symbols: ["NVDA", "MSFT", "AMZN", "GOOGL", "QQQ", "SPY"],
    regime: "Macro-led risk-off",
    catalyst: "10Y Treasury yield broke higher and compressed long-duration multiples.",
    outcomes: { d1: "-1.6%", d5: "-4.2%", d20: "+0.9%" },
    recovery: "Recovered in 8 sessions",
    whySimilar: "Rates pressure was the dominant mechanical driver for growth equities.",
    whyDifferent: "Current move has more single-theme AI concentration risk.",
  },
  {
    id: "hyperscaler-aug24",
    date: "Aug 2024",
    title: "Hyperscaler capex caution",
    tags: ["ai-capex", "cloud", "semis", "earnings"],
    symbols: ["NVDA", "AMD", "AVGO", "MSFT", "AMZN", "GOOGL"],
    regime: "Crowded growth unwind",
    catalyst: "Cloud-company guidance raised questions about AI infrastructure payback timing.",
    outcomes: { d1: "-3.1%", d5: "-7.1%", d20: "-2.4%" },
    recovery: "Recovered in 22 sessions",
    whySimilar: "Cloud capex commentary transmitted into semis and mega-cap software.",
    whyDifferent: "Current earnings calendar may either confirm or challenge the thesis faster.",
  },
  {
    id: "rates-apr24",
    date: "Apr 2024",
    title: "Rates surprise + tech weakness",
    tags: ["rates", "macro", "tech", "breadth"],
    symbols: ["AAPL", "MSFT", "META", "NVDA", "QQQ", "SPY"],
    regime: "Mixed macro stress",
    catalyst: "Inflation data repriced cuts and forced rotation out of long-duration tech.",
    outcomes: { d1: "-1.2%", d5: "-3.6%", d20: "+2.1%" },
    recovery: "Recovered in 5 sessions",
    whySimilar: "Macro repricing pressured tech even where company fundamentals were unchanged.",
    whyDifferent: "Today has more sector-specific reaction-chain evidence.",
  },
  {
    id: "ev-demand-feb25",
    date: "Feb 2025",
    title: "EV demand softness read-through",
    tags: ["ev-demand", "consumer", "autos", "margins"],
    symbols: ["TSLA", "F", "GM", "RIVN", "LCID", "XLY"],
    regime: "Single-theme risk-off",
    catalyst: "European registrations and price-cut chatter reset delivery expectations.",
    outcomes: { d1: "-3.8%", d5: "-6.4%", d20: "-4.9%" },
    recovery: "Stabilised after 18 sessions",
    whySimilar: "Demand data created read-through across autos and consumer discretionary.",
    whyDifferent: "Current macro backdrop may amplify or dampen the single-name signal.",
  },
  {
    id: "defensive-rotation-jun24",
    date: "Jun 2024",
    title: "Defensive rotation into quality",
    tags: ["defensive", "rotation", "quality", "mega-cap"],
    symbols: ["AAPL", "XLV", "XLP", "SPY"],
    regime: "Risk-off internals, calm index",
    catalyst: "Investors sold high-beta growth while hiding in cash-rich quality and defensives.",
    outcomes: { d1: "+0.4%", d5: "+1.2%", d20: "+3.0%" },
    recovery: "Outperformed during drawdown",
    whySimilar: "Relative strength came from defensive quality flows rather than a fresh catalyst.",
    whyDifferent: "If today is catalyst-led, defensive bid may be less persistent.",
  },
  {
    id: "bank-yield-jan25",
    date: "Jan 2025",
    title: "Banks bid on higher yields",
    tags: ["rates", "banks", "financials", "rotation"],
    symbols: ["JPM", "BAC", "C", "GS", "XLF"],
    regime: "Value rotation",
    catalyst: "Higher yields revived net-interest-margin expectations while growth lagged.",
    outcomes: { d1: "+1.1%", d5: "+2.9%", d20: "+4.6%" },
    recovery: "Trend persisted for 3 weeks",
    whySimilar: "Rates pressure can benefit financials even as growth weakens.",
    whyDifferent: "Credit-risk headlines can quickly offset the yield benefit.",
  },
  {
    id: "energy-opec-sep24",
    date: "Sep 2024",
    title: "OPEC supply discipline bid",
    tags: ["energy", "oil", "inflation", "rotation"],
    symbols: ["XOM", "CVX", "XLE", "USO"],
    regime: "Commodity-led rotation",
    catalyst: "OPEC+ supply headlines lifted crude and energy equities.",
    outcomes: { d1: "+1.8%", d5: "+4.4%", d20: "+5.2%" },
    recovery: "Momentum faded after crude stalled",
    whySimilar: "Energy moved on supply discipline rather than broad equity beta.",
    whyDifferent: "If dollar/yields rise together, oil sensitivity can diverge from equities.",
  },
  {
    id: "search-ai-risk-nov24",
    date: "Nov 2024",
    title: "AI search disruption narrative",
    tags: ["ai-competition", "ads", "cloud", "mega-cap"],
    symbols: ["GOOGL", "META", "MSFT", "AMZN"],
    regime: "Narrative de-rate",
    catalyst: "AI-native interfaces raised questions about search share and ad pricing.",
    outcomes: { d1: "-1.9%", d5: "-3.3%", d20: "+0.4%" },
    recovery: "Recovered after ad data stabilised",
    whySimilar: "Competitive AI narrative pressured ad and cloud platforms together.",
    whyDifferent: "Current move may be more capex-driven than revenue-share driven.",
  },
];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metaPatternTags(sym) {
  const template = inferSectorTemplate(sym);
  const tags = new Set([sym]);
  if (template === "financials") {
    tags.add("banks");
    tags.add("financials");
    tags.add("rates");
    tags.add("rotation");
  } else if (template === "energy") {
    tags.add("energy");
    tags.add("oil");
    tags.add("inflation");
  } else if (template === "semis") {
    tags.add("ai-capex");
    tags.add("semis");
  } else if (template === "ev") {
    tags.add("ev-demand");
    tags.add("autos");
  }
  return [...tags];
}

function currentPatternTags(sym) {
  const d = getWimEntry(sym);
  const text = [sym, d.name, d.summary, ...(d.reasons || []).flat()].join(" ").toLowerCase();
  if (!d.summary?.trim()) return metaPatternTags(sym);
  const tags = new Set();
  if (/ai|capex|datacenter|hyperscaler|infrastructure|semiconductor|semi|nvda|amd|avgo|soxx/.test(text)) {
    tags.add("ai-capex");
    tags.add("semis");
  }
  if (/yield|rates|10y|duration|fed|inflation|cpi/.test(text)) {
    tags.add("rates");
    tags.add("macro");
  }
  if (/reaction|sympathy|correlation|basket|chain/.test(text)) tags.add("reaction-chain");
  if (/ev|tesla|registrations|deliveries|auto|margin/.test(text)) {
    tags.add("ev-demand");
    tags.add("autos");
  }
  if (/defensive|quality|services|buyback|healthcare|staples/.test(text)) {
    tags.add("defensive");
    tags.add("quality");
  }
  if (/bank|jpm|financial|nim|credit/.test(text)) {
    tags.add("banks");
    tags.add("financials");
  }
  if (/energy|oil|crude|opec|xom|cvx/.test(text)) {
    tags.add("energy");
    tags.add("oil");
  }
  if (/ad|search|cloud|competition/.test(text)) {
    tags.add("ads");
    tags.add("cloud");
  }
  tags.add(sym);
  return [...tags];
}

function scoreHistoricalPattern(sym, pattern) {
  const tags = currentPatternTags(sym);
  const overlap = pattern.tags.filter((t) => tags.includes(t)).length;
  const symbolMatch = pattern.symbols.includes(sym) ? 22 : 0;
  const familyMatch = pattern.symbols.some((s) => getContagionPeers(sym).includes(s)) ? 12 : 0;
  const score = Math.min(96, 38 + overlap * 12 + symbolMatch + familyMatch);
  const matchedTags = pattern.tags.filter((t) => tags.includes(t));
  return { ...pattern, score, matchedTags };
}

export function matchHistoricalPatterns(sym) {
  return historicalPatternLibrary
    .map((p) => scoreHistoricalPattern(sym, p))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

/**
 * @param {HTMLElement} host
 * @param {string} sym
 */
export function renderPatternsPanel(host, sym) {
  const matches = matchHistoricalPatterns(sym);
  const avgScore = Math.round(matches.reduce((s, m) => s + m.score, 0) / Math.max(1, matches.length));
  host.innerHTML = `
    <div class="tdd-patterns">
      <div class="history-engine-head">
        <div>
          <div class="history-engine-title">Pattern engine · ${esc(sym)}</div>
          <div class="history-engine-sub">Matches current catalysts against historical setups by catalyst tags, sector/factor overlap, and reaction-chain similarity. Context only. Not a forecast.</div>
        </div>
        <div class="history-engine-badge">Avg match ${avgScore}%</div>
      </div>
      ${matches
        .map((m, i) => {
          const series = genSeries(22, 4, parseFloat(m.outcomes.d5) < 0 ? -0.35 : 0.18, i + 19);
          const color = parseFloat(m.outcomes.d5) < 0 ? "#ff5b6e" : "#3ddc97";
          return `<div class="history-item">
            <div class="history-date">${esc(m.date)}</div>
            <div class="history-desc">
              <div class="ev">${esc(m.title)}</div>
              <div class="det">${esc(m.catalyst)}</div>
              <div class="history-tags">${[m.regime, ...m.matchedTags.slice(0, 4)].map((t) => `<span>${esc(t)}</span>`).join("")}</div>
              <div class="history-outcomes">
                <div class="history-outcome"><b>1D</b>${esc(m.outcomes.d1)}</div>
                <div class="history-outcome"><b>5D</b>${esc(m.outcomes.d5)}</div>
                <div class="history-outcome"><b>20D</b>${esc(m.outcomes.d20)}</div>
              </div>
              <div class="history-why"><b style="color:var(--gold)">Why similar:</b> ${esc(m.whySimilar)} <b style="color:var(--ink)">Why different:</b> ${esc(m.whyDifferent)}</div>
            </div>
            <div>
              <div class="history-score"><b>${m.score}%</b>similarity</div>
              <div>${spark(series, color)}</div>
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
}
