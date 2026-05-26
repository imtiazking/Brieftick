/**
 * Scenario engine — identifies hypothetical outcomes and frames market reactions.
 * Educational framing only; no exact probabilities or trade advice.
 *
 * @module logic/engines/scenarioEngine
 */

import { logicDebug } from "../shared.js";
import {
  detectScenarioQueryKind,
  extractPromptTopics,
  isGeopoliticalBriefingQuery,
} from "./topicContext.js";

/** @typedef {'geopolitical'|'macro'|'market_event'|'policy'|'commodity'|'growth'} ScenarioCategory */

/**
 * @typedef {Object} ScenarioFrame
 * @property {string} id
 * @property {string} label
 * @property {ScenarioCategory} category
 * @property {string} headline
 * @property {string} likelihoodPhrase
 * @property {string[]} bullishOutcomes
 * @property {string[]} bearishOutcomes
 * @property {string[]} secondOrderEffects
 * @property {string} pricingInterpretation
 * @property {string[]} assetClasses
 */

/**
 * @typedef {Object} ScenarioEngineResult
 * @property {string} prompt
 * @property {ScenarioFrame} primary
 * @property {ScenarioFrame[]} alternatives
 * @property {string[]} themes
 * @property {boolean} isScenarioPrompt
 * @property {'briefing'|'hypothetical'} queryKind
 * @property {string[]} topics
 */

const LIKELIHOOD = {
  low: "low probability",
  moderate: "moderate probability",
  elevated: "elevated likelihood",
};

const SCENARIO_LIBRARY = [
  {
    id: "active_geopolitical_conflict",
    label: "Active geopolitical conflict (current events)",
    category: "geopolitical",
    patterns:
      /iran|ukraine|gaza|israel|hamas|hezbollah|middle east|war in|war\?|conflict in|military strike|hormuz|strait|sanctions|latest on.*war|latest.*iran|update on.*iran|geopolit/i,
    headline: "An active geopolitical conflict with cross-asset spillovers",
    likelihood: "elevated",
    bullish: [
      "Defense and energy names may hold bid while uncertainty persists",
      "Safe-haven flows may support gold and quality duration if risk appetite fades",
    ],
    bearish: [
      "Global equities may trade with elevated gap risk around headlines",
      "Oil and shipping routes may see risk premia if supply disruption is discussed",
      "Airlines, travel, and EM risk assets may lag on escalation headlines",
    ],
    secondOrder: [
      "Inflation expectations may react to energy moves before growth expectations adjust",
      "Dollar and rates may co-move with risk appetite rather than isolated fundamentals",
      "Breadth may narrow as investors hide in mega-cap liquidity",
    ],
    pricing:
      "Markets appear to be pricing in headline-driven volatility; investors may interpret each development through energy, defense, and risk-premium channels rather than a single equity narrative.",
    assets: ["equities", "sectors", "volatility", "commodities", "rates", "macro", "portfolios"],
  },
  {
    id: "peace_deal",
    label: "Geopolitical de-escalation / peace deal",
    category: "geopolitical",
    patterns:
      /peace deal|ceasefire|de-escalat|geopolitical risk ease|conflict resolv|war end|diplomatic breakthrough/i,
    headline: "A material de-escalation in geopolitical tension",
    likelihood: "moderate",
    bullish: [
      "Risk assets may re-rate as tail-risk premium compresses",
      "European and EM equities could see relief rallies",
      "Defense contractors may give back recent risk premia",
    ],
    bearish: [
      "Energy risk premium could fade, pressuring oil-linked equities",
      "Safe-haven bid in gold and Treasuries may soften",
      "Volatility term structure may normalize lower at the front end",
    ],
    secondOrder: [
      "Shipping and logistics costs may normalize if supply routes stabilize",
      "Consumer confidence in energy-sensitive regions may improve with a lag",
      "Cross-border capital flows may rotate back toward cyclical exposure",
    ],
    pricing:
      "Markets appear to be pricing in persistent geopolitical risk; investors may interpret a credible deal as a relief event rather than a full regime shift.",
    assets: ["equities", "sectors", "volatility", "commodities", "rates", "macro"],
  },
  {
    id: "oil_spike",
    label: "Oil / energy price spike",
    category: "commodity",
    patterns: /oil spike|crude surge|energy shock|opec cut|gas prices|oil price/i,
    headline: "A sharp rise in energy prices",
    likelihood: "elevated",
    bullish: [
      "Energy producers and integrated majors may outperform on cash-flow visibility",
      "Inflation-linked assets may attract flows if CPI expectations reprice",
    ],
    bearish: [
      "Transport, airlines, and discretionary consumption may face margin pressure",
      "Long-duration growth may reprice lower if real yields rise",
      "Import-heavy economies may see currency and earnings headwinds",
    ],
    secondOrder: [
      "Central banks may emphasize energy pass-through in near-term inflation commentary",
      "Sector rotation may favor value and commodity-linked equities over pure growth",
      "Credit spreads in energy-intensive industrials may widen selectively",
    ],
    pricing:
      "Markets appear to be pricing in a moderate energy risk premium; investors may interpret a sustained spike as a stagflation-style headwind for multiples.",
    assets: ["equities", "sectors", "commodities", "rates", "volatility", "macro"],
  },
  {
    id: "fed_rate_cuts",
    label: "Fed rate cuts / easier policy",
    category: "policy",
    patterns: /fed cut|rate cut|easier policy|dovish fed|policy easing|cuts rates/i,
    headline: "A shift toward easier monetary policy",
    likelihood: "moderate",
    bullish: [
      "Rate-sensitive equities and housing-linked names may benefit from lower discount rates",
      "High-beta growth may see multiple support if financial conditions ease",
      "Credit markets may tighten spreads as refinancing risk eases",
    ],
    bearish: [
      "Banks’ net interest margins may compress if the curve bull-flatten aggressively",
      "The dollar may weaken, helping multinationals but pressuring importers",
      "If cuts are driven by growth fear, cyclicals may lag despite lower rates",
    ],
    secondOrder: [
      "Yield curve shape may matter more than the level of cuts for sector leadership",
      "Small caps may catch a bid if funding stress eases, with moderate probability",
      "Commodities may respond to dollar moves before pure growth optimism returns",
    ],
    pricing:
      "Markets appear to be pricing in gradual easing; investors may interpret faster cuts as either supportive (soft landing) or defensive (growth scare).",
    assets: ["equities", "rates", "sectors", "volatility", "portfolios", "macro"],
  },
  {
    id: "inflation_cooling",
    label: "Inflation cooling / disinflation",
    category: "macro",
    patterns: /inflation cool|disinflation|cpi fall|inflation eas|price pressures ease/i,
    headline: "A sustained cooling in inflation pressures",
    likelihood: "moderate",
    bullish: [
      "Long-duration assets may benefit if real yields drift lower",
      "Consumer discretionary may see demand support as real income stabilizes",
      "EM assets may attract flows if dollar strength fades alongside softer CPI",
    ],
    bearish: [
      "Commodity-linked equities may lag if industrial demand expectations soften",
      "Value cyclicals may underperform if growth scare narratives emerge alongside weak prices",
    ],
    secondOrder: [
      "Policy expectations may shift toward patience rather than urgency for hikes",
      "Breakevens may compress, affecting TIPS and inflation-sensitive sectors",
      "Earnings revisions may favor margin expansion stories in consumer-facing names",
    ],
    pricing:
      "Markets appear to be pricing in sticky but moderating inflation; investors may interpret faster cooling as supportive for multiples with low probability of immediate aggressive easing.",
    assets: ["equities", "macro", "rates", "sectors", "volatility"],
  },
  {
    id: "recession",
    label: "Recession / growth scare",
    category: "growth",
    patterns: /recession|hard landing|growth scare|economic slowdown|contraction/i,
    headline: "A broader growth slowdown or recession scenario",
    likelihood: "low",
    bullish: [
      "Defensive sectors and quality cash-flow names may hold relative resilience",
      "Long-duration Treasuries may benefit if growth expectations collapse",
    ],
    bearish: [
      "Cyclicals, industrials, and small caps may underperform with elevated likelihood of estimate cuts",
      "Credit-sensitive sectors may face spread widening and refinancing stress",
      "Earnings breadth may deteriorate across consumer and capital goods",
    ],
    secondOrder: [
      "Labor market cooling may lag equities, affecting services consumption with a delay",
      "Policy response may arrive after markets have already repriced risk assets",
      "Volatility may cluster around macro data surprises rather than single-stock events",
    ],
    pricing:
      "Markets appear to be pricing in a soft-landing baseline; investors may interpret recession signals as a risk-off rotation rather than an immediate policy pivot.",
    assets: ["equities", "sectors", "volatility", "rates", "portfolios", "macro"],
  },
  {
    id: "ai_spending_slowdown",
    label: "AI / tech spending slowdown",
    category: "market_event",
    patterns: /ai spending|ai slowdown|hyperscaler capex|semiconductor demand|tech spending cut/i,
    headline: "A slowdown in AI and hyperscaler capital spending",
    likelihood: "moderate",
    bullish: [
      "Capital discipline narratives may support free-cash-flow leaders outside pure AI",
      "Defensive tech and software with recurring revenue may hold up relatively",
    ],
    bearish: [
      "Semiconductors, equipment, and data-center suppliers may face estimate risk",
      "Mega-cap indices may drag breadth lower given concentration in AI leaders",
      "High-multiple software may reprice if growth expectations reset",
    ],
    secondOrder: [
      "Supply chains tied to GPUs, networking, and power infrastructure may see order volatility",
      "Energy demand narratives for power generation may cool with a lag",
      "Factor rotation may favor value and dividends over speculative growth",
    ],
    pricing:
      "Markets appear to be pricing in sustained AI investment; investors may interpret a slowdown as a narrative unwind in crowded growth exposure.",
    assets: ["equities", "sectors", "volatility", "portfolios"],
  },
  {
    id: "tech_selloff",
    label: "Technology sell-off",
    category: "market_event",
    patterns: /tech sell.?off|nasdaq drop|mega.?cap drawdown|growth unwind/i,
    headline: "A sharp drawdown in technology leadership",
    likelihood: "elevated",
    bullish: [
      "Laggard sectors may see relative inflows if investors rotate for beta balance",
      "Volatility sellers may emerge if the move is liquidity-driven rather than macro",
    ],
    bearish: [
      "Index-level returns may skew negative due to mega-cap weights",
      "Semiconductor and cloud peers may move in sympathy with elevated likelihood",
      "Risk parity and quant deleveraging may amplify intraday swings",
    ],
    secondOrder: [
      "Corporate buyback windows may cushion single names but not index concentration risk",
      "Credit for growth issuers may widen even if macro data is stable",
    ],
    pricing:
      "Markets appear to be pricing in elevated growth sensitivity; investors may interpret the move as factor de-grossing rather than a full macro regime change.",
    assets: ["equities", "sectors", "volatility", "portfolios"],
  },
  {
    id: "rates_rise",
    label: "Rates move higher",
    category: "policy",
    patterns: /rates rise|yields up|higher for longer|hawkish fed|yield spike/i,
    headline: "A sustained move higher in interest rates",
    likelihood: "elevated",
    bullish: [
      "Financials may benefit if the curve steepens with growth intact",
      "Cash and short-duration assets may see inflows as alternatives to equities",
    ],
    bearish: [
      "Long-duration growth may face multiple compression",
      "Real estate and utilities may lag as discount rates rise",
      "Highly leveraged issuers may face refinancing pressure",
    ],
    secondOrder: [
      "Dollar strength may pressure EM and commodity importers",
      "Housing activity may cool, affecting builders and home-related consumption",
    ],
    pricing:
      "Markets appear to be pricing in restrictive policy for longer; investors may interpret higher yields as tightening financial conditions across risk assets.",
    assets: ["equities", "rates", "sectors", "volatility", "macro", "portfolios"],
  },
  {
    id: "macro_shock",
    label: "Broad macro shock",
    category: "macro",
    patterns: /.*/,
    headline: "A broad macro shock or surprise event",
    likelihood: "moderate",
    bullish: [
      "Defensive equities and quality factors may outperform on a relative basis",
      "Safe-haven bonds may benefit if growth expectations fall sharply",
    ],
    bearish: [
      "Risk assets may correlate higher in the short term",
      "Cross-asset volatility may rise with elevated likelihood of gap risk",
    ],
    secondOrder: [
      "Liquidity conditions may dominate fundamentals until clarity returns",
      "Sector dispersion may widen as investors differentiate balance-sheet strength",
    ],
    pricing:
      "Markets appear to be pricing in a range of outcomes; investors may interpret the shock through the lens of prior regime (inflation, growth, or policy surprise).",
    assets: ["equities", "sectors", "volatility", "rates", "commodities", "macro", "portfolios"],
  },
];

/**
 * @param {typeof SCENARIO_LIBRARY[0]} def
 * @returns {ScenarioFrame}
 */
function toFrame(def) {
  const likelihoodKey = def.likelihood || "moderate";
  return {
    id: def.id,
    label: def.label,
    category: def.category,
    headline: def.headline,
    likelihoodPhrase: LIKELIHOOD[likelihoodKey] || LIKELIHOOD.moderate,
    bullishOutcomes: def.bullish,
    bearishOutcomes: def.bearish,
    secondOrderEffects: def.secondOrder,
    pricingInterpretation: def.pricing,
    assetClasses: def.assets,
  };
}

/**
 * @param {string} prompt
 * @returns {typeof SCENARIO_LIBRARY[0] | null}
 */
function matchScenarioDefinition(prompt) {
  const t = (prompt || "").trim();
  if (!t) return null;
  for (const def of SCENARIO_LIBRARY) {
    if (def.id === "macro_shock") continue;
    if (def.patterns.test(t)) return def;
  }
  return null;
}

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function isScenarioStylePrompt(prompt) {
  const t = (prompt || "").toLowerCase();
  if (!t) return false;
  if (isGeopoliticalBriefingQuery(prompt)) return true;
  return (
    /what happens if|what if|scenario|hypothetical|if .+ (rises|falls|spikes|cuts|deal)|peace deal|oil spike|recession|inflation cool|rate cut|ai spending/i.test(
      t
    ) || !!matchScenarioDefinition(prompt)
  );
}

/**
 * @param {string} prompt
 * @param {import('../entityResolver.js').ResolvedEntity} [primaryEntity]
 * @returns {ScenarioEngineResult}
 */
export function runScenarioEngine(prompt, primaryEntity) {
  const queryKind = detectScenarioQueryKind(prompt);
  let matched = matchScenarioDefinition(prompt);
  if (queryKind === "briefing" && !matched) {
    matched =
      SCENARIO_LIBRARY.find((d) => d.id === "active_geopolitical_conflict") || null;
  }
  const fallback = SCENARIO_LIBRARY.find((d) => d.id === "macro_shock");
  const primaryDef = matched || fallback;
  const primary = toFrame(primaryDef);

  const alternatives = SCENARIO_LIBRARY.filter(
    (d) => d.id !== primaryDef.id && d.id !== "macro_shock"
  )
    .filter((d) => d.patterns.test(prompt || ""))
    .slice(0, 2)
    .map(toFrame);

  if (!alternatives.length && primaryDef.id !== "macro_shock") {
    const related = SCENARIO_LIBRARY.filter(
      (d) => d.category === primaryDef.category && d.id !== primaryDef.id
    ).slice(0, 1);
    alternatives.push(...related.map(toFrame));
  }

  const topics = extractPromptTopics(prompt);
  const themes = [...topics];
  if (primaryEntity?.label) themes.push(primaryEntity.label);
  if (primaryEntity?.symbol) themes.push(primaryEntity.symbol);
  if (primary.category) themes.push(primary.category.replace("_", " "));

  const result = {
    prompt,
    primary,
    alternatives,
    themes,
    topics,
    queryKind,
    isScenarioPrompt: isScenarioStylePrompt(prompt) || !!matched,
  };

  logicDebug("scenarioEngine", {
    primary: primary.id,
    queryKind,
    topics,
    alternatives: alternatives.map((a) => a.id),
  });

  return result;
}

export { SCENARIO_LIBRARY };
