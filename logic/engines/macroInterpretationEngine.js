/**
 * Macro interpretation engine — nuanced conceptual macro reasoning.
 * No headline dependency; explains mechanisms and market interpretation.
 *
 * @module logic/engines/macroInterpretationEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

/**
 * @typedef {Object} MacroInterpretation
 * @property {string} id
 * @property {string} label
 * @property {string} directAnswer
 * @property {string} expectations
 * @property {string} growthEarnings
 * @property {string} ratesLiquidity
 * @property {string} positioningNarrative
 * @property {string} summary
 * @property {string[]} keyDrivers
 */

const INTERPRETATION_LIBRARY = [
  {
    id: "inflation_bearish_growth",
    patterns:
      /lower inflation.*(bearish|bad|negative|hurt|harm|weak).*growth|inflation.*bearish.*growth|why can lower inflation|disinflation.*growth stock/i,
    label: "Lower inflation vs growth stocks",
    directAnswer:
      "Lower inflation can become bearish for growth stocks if markets interpret it as slowing demand rather than successful disinflation. Investors may then focus on weaker earnings growth, slower capex and recession risk instead of lower-rate support.",
    expectations:
      "Rate-cut optimism fades when inflation falls because demand is weakening, not because policy has won.",
    growthEarnings:
      "Growth multiples compress when earnings revisions turn down; disinflation from demand loss is not the same as a productivity-driven soft landing.",
    ratesLiquidity:
      "Yields may fall, but the growth channel can dominate if recession risk rises faster than discount-rate relief.",
    positioningNarrative:
      "Crowded growth positioning can unwind if the narrative shifts from ‘inflation solved’ to ‘growth scare’.",
    keyDrivers: [
      "Demand-driven disinflation",
      "Earnings downgrades",
      "Narrative shift from cuts to recession",
    ],
  },
  {
    id: "rate_cuts_bearish",
    patterns:
      /rate cut.*(bad|bearish|hurt|negative)|cuts bad for|why would.*cut.*hurt|easing.*selloff/i,
    label: "Rate cuts interpreted bearishly",
    directAnswer:
      "Rate cuts can be bearish when markets read them as a response to incoming recession rather than a smooth soft landing. Equities may fall if growth expectations collapse faster than the relief from lower discount rates.",
    expectations:
      "The policy path matters less than why the Fed is cutting — panic cuts signal stress.",
    growthEarnings:
      "Earnings risk rises in cyclicals and small caps if cuts coincide with labor market cracks.",
    ratesLiquidity:
      "Liquidity helps, but the curve and credit spreads must confirm easing is supportive, not desperate.",
    positioningNarrative:
      "Risk assets can sell off into cuts if positioning was already long ‘immaculate disinflation’.",
    keyDrivers: ["Recession pricing", "Credit stress", "Policy panic vs pivot"],
  },
  {
    id: "yields_fall_recession",
    patterns:
      /falling yields.*recession|yields? (fall|drop|decline).*signal|lower yields.*bad|bond rally.*bad for stock/i,
    label: "Falling yields as recession signal",
    directAnswer:
      "Falling yields often signal recession risk or flight-to-quality, not pure bullishness for equities. Growth stocks may only benefit if the move is disinflationary with stable earnings; if yields fall on growth fear, equities can still weaken.",
    expectations:
      "Markets separate ‘good’ yield declines (inflation falling) from ‘bad’ declines (growth collapsing).",
    growthEarnings:
      "Earnings breadth matters — narrow mega-cap strength can mask cyclical weakness.",
    ratesLiquidity:
      "Liquidity can rush into bonds first; equities lag until growth stabilizes.",
    positioningNarrative:
      "Duration trades work before beta recovers; timing the equity rebound is the hard part.",
    keyDrivers: ["Growth scare", "Flight to quality", "Earnings risk"],
  },
  {
    id: "weak_data_rally",
    patterns:
      /weak(er)? data.*(rally|rise|up)|bad data.*market up|weak.*equities.*rise|stocks rally on weak/i,
    label: "Weak data causing equities to rally",
    directAnswer:
      "Weaker data can lift equities when investors price faster Fed easing or peak yields, not because growth improved. The rally is often a rates/liquidity trade until earnings confirm deterioration.",
    expectations:
      "Soft data raises cut odds; markets buy duration and growth beta before the labor market fully cracks.",
    growthEarnings:
      "If subsequent earnings miss, the rally can reverse quickly — weak data rallies are fragile.",
    ratesLiquidity:
      "Liquidity expansion expectations can overpower near-term macro prints for a few sessions.",
    positioningNarrative:
      "Short covering and crowded shorts in rates-sensitive growth can amplify the move.",
    keyDrivers: ["Cut pricing", "Peak yields", "Positioning squeeze"],
  },
  {
    id: "soft_landing_vs_recession",
    patterns:
      /soft landing|hard landing|recession.*pricing|disinflation.*soft|immaculate/i,
    label: "Soft landing vs recession pricing",
    directAnswer:
      "Soft landing pricing assumes inflation falls without a large rise in unemployment; recession pricing assumes earnings and capex collapse. The same inflation print can flip the regime depending on labor and consumption context.",
    expectations:
      "Markets oscillate between these narratives as payrolls, retail sales and credit data arrive.",
    growthEarnings:
      "Cyclicals outperform in soft landing; defensives lead when recession risk dominates.",
    ratesLiquidity:
      "The Fed reaction function is the bridge — patience if soft, urgency if hard.",
    positioningNarrative:
      "Cross-asset correlations tighten when the market cannot decide which story wins.",
    keyDrivers: ["Labor market", "Consumption", "Fed reaction"],
  },
  {
    id: "ai_capex_slowdown",
    patterns:
      /ai capex|hyperscaler.*slow|ai spending|semiconductor.*slow|ai leadership.*weak/i,
    label: "AI capex slowdown interpretation",
    directAnswer:
      "An AI capex slowdown can hurt growth indices through mega-cap concentration even if the broad economy is stable. Markets may reprice long-duration tech on lower forward investment, not just near-term earnings.",
    expectations:
      "Investors reassess whether AI revenues justify prior capex intensity.",
    growthEarnings:
      "Semis, networking and power infrastructure feel the first estimate cuts.",
    ratesLiquidity:
      "Lower capex can be disinflationary, but growth stocks may still fall on multiple compression.",
    positioningNarrative:
      "Crowded AI trades unwind faster than fundamentals change.",
    keyDrivers: ["Capex cycle", "Mega-cap weight", "Narrative unwind"],
  },
  {
    id: "liquidity_regime",
    patterns:
      /liquidity regime|qt|qe|balance sheet|financial conditions|tighter liquidity|easier liquidity/i,
    label: "Liquidity regime shift",
    directAnswer:
      "Liquidity regimes set the backdrop for risk assets: tightening drains speculative beta, easing supports multiples. Equities can diverge from macro data for months if liquidity direction changes.",
    expectations:
      "Markets front-run balance-sheet and funding stress signals.",
    growthEarnings:
      "High-beta and unprofitable growth are most sensitive; quality cash flows hold better.",
    ratesLiquidity:
      "Real rates and dollar liquidity often move together with risk appetite.",
    positioningNarrative:
      "Leveraged funds de-gross when liquidity impulse turns negative.",
    keyDrivers: ["Fed balance sheet", "Funding stress", "Financial conditions"],
  },
  {
    id: "ai_structure_break",
    patterns:
      /break.*(ai|market structure)|macro conditions.*break|ai.?led market|fragil.*ai|underpric.*ai/i,
    label: "Breaking AI-led market structure",
    directAnswer:
      "The AI-led structure breaks if earnings revisions, capex intensity or liquidity no longer support mega-cap concentration. Breadth deterioration, higher real yields or a volatility reset can force de-grossing even if the index level looks stable.",
    expectations:
      "Markets reassess whether AI revenues justify prior investment and index weights.",
    growthEarnings:
      "Semis, networking and hyperscaler estimates are the first pressure point; cyclicals matter for breadth confirmation.",
    ratesLiquidity:
      "Tighter financial conditions or sticky real yields compress duration-sensitive leaders faster than the index suggests.",
    positioningNarrative:
      "Crowded AI positioning amplifies downside when the narrative shifts from leadership to concentration risk.",
    keyDrivers: ["Earnings breadth", "Capex cycle", "Liquidity impulse"],
  },
  {
    id: "equity_bond_divergence",
    patterns:
      /equities.*(strong|firm|up).*(bond|yields)|bond.*(slower growth|recession).*(equities|stocks)/i,
    label: "Equity–bond growth divergence",
    directAnswer:
      "Equities can stay firm while bonds price slower growth when investors split between earnings resilience in mega-caps and recession hedging in duration. The divergence often resolves through earnings downgrades, a volatility spike, or a catch-up rally in cyclicals.",
    expectations:
      "Bonds lead growth scares; equities lag until earnings confirm or the Fed eases decisively.",
    growthEarnings:
      "If cyclicals and small caps keep lagging, equities may be masking narrow strength.",
    ratesLiquidity:
      "Falling yields help multiples only if recession risk stays contained.",
    positioningNarrative:
      "Duration and equity beta can move opposite ways when positioning is split between hedges and crowded growth.",
    keyDrivers: ["Growth scare", "Earnings breadth", "Fed reaction"],
  },
  {
    id: "hidden_fragilities",
    patterns:
      /hidden fragil|underpric|complacent|what.*markets.*missing|fragility/i,
    label: "Hidden market fragilities",
    directAnswer:
      "Markets often underprice concentration, volatility compression and cross-asset divergence — calm indices can hide narrow AI leadership, complacency toward geopolitical or energy risk, and bonds pricing slower growth ahead of equities.",
    expectations:
      "Fragilities surface when a single catalyst hits crowded positioning or thin liquidity.",
    growthEarnings:
      "Breadth fatigue matters more than index levels when mega-caps dominate.",
    ratesLiquidity:
      "Liquidity and vol regimes can flip faster than macro headlines.",
    positioningNarrative:
      "Crowded trades and low vol raise gap risk when narratives shift.",
    keyDrivers: ["Concentration", "Vol compression", "Divergence"],
  },
  {
    id: "cross_asset_relationships",
    patterns:
      /relationships across|matter most right now|oil.*yields.*volatility|cross.?asset/i,
    label: "Dominant cross-asset relationships",
    directAnswer:
      "The dominant relationships shift with regime: rates and liquidity usually lead growth multiples; oil feeds inflation and geopolitical risk premia; volatility sets gap risk; AI concentration links semis, mega-cap beta and capex narratives. Right now the market’s sensitivity ranking depends on which of these factors is moving fastest.",
    expectations:
      "Investors rank factors by speed of repricing, not static correlation tables.",
    growthEarnings:
      "Earnings breadth tells you whether macro shocks are passing through demand or only multiples.",
    ratesLiquidity:
      "Real yields and financial conditions are the bridge between macro and equity beta.",
    positioningNarrative:
      "Crowded factor exposure can make one channel dominate for days even if fundamentals are mixed.",
    keyDrivers: ["Rates", "Oil", "Volatility", "AI beta"],
  },
  {
    id: "inflation_not_bullish",
    patterns:
      /inflation.*(not|isn't|is not).*bullish|why.*inflation.*fall|lower inflation|disinflation/i,
    label: "Inflation dynamics interpretation",
    directAnswer:
      "Lower inflation is not automatically bullish because context determines whether disinflation comes from supply relief, policy success or demand destruction. Growth stocks need both lower inflation and stable earnings — not just softer CPI.",
    expectations:
      "Breakevens and Fed speak clarify whether inflation is ‘good’ or ‘bad’ disinflation.",
    growthEarnings:
      "Margins improve only if volumes hold; price cuts can mean weaker demand.",
    ratesLiquidity:
      "Rate cuts help multiples only if recession risk stays contained.",
    positioningNarrative:
      "Narrative can flip from inflation focus to growth focus within a single data cycle.",
    keyDrivers: ["CPI composition", "Demand vs supply", "Earnings path"],
  },
];

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function isMacroInterpretationQuery(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t || t.length < 15) return false;

  if (
    /latest\s+(on|about)|what.?'?s the latest|update on|news on|headline today|breaking/i.test(
      t
    )
  ) {
    return false;
  }

  const conceptual =
    /why can|why would|why does|why is it that|how can|how would|how does|explain why|what does it mean|what happens if|what happens when|what if .+ (mean|imply|signal)|why .* bearish|why .* bullish|why .* bad|why .* good|why .* hurt|why .* help/i.test(
      t
    );

  const macroTopic =
    /inflation|disinflation|cpi|pce|rates?|yield|fed|fomc|growth stock|recession|soft landing|hard landing|liquidity|qe|qt|ai capex|hyperscaler|earnings growth|rate cut|easing|tightening|macro|equities rally|bond|market structure|ai.?led|fragilit|underpric|cross.?asset|breadth|concentration|positioning|diverg/i.test(
      t
    );

  const abstractWhy =
    /^why\s+(can|would|does|do|is|are|have)\b/.test(t) && macroTopic;

  const analyticalWhat =
    /^what\s+(macro|relationships|hidden|conditions|fragil)/i.test(t) && macroTopic;

  return (conceptual && macroTopic) || abstractWhy || analyticalWhat;
}

/**
 * @param {string} prompt
 * @returns {MacroInterpretation}
 */
export function runMacroInterpretationEngine(prompt) {
  const t = prompt || "";
  for (const item of INTERPRETATION_LIBRARY) {
    if (item.patterns.test(t)) {
      logicDebug("macroInterpretationEngine", item.id);
      return { ...item, summary: item.directAnswer };
    }
  }

  const fallback = {
    id: "general_macro",
    label: "Macro interpretation",
    directAnswer:
      "Macro variables are not one-directional for equities — the market prices the reason behind the move. Growth sensitivity, earnings revisions, liquidity and positioning often matter more than the headline macro print alone.",
    expectations:
      "Investors weigh whether the shock changes Fed path, earnings or risk appetite.",
    growthEarnings:
      "Long-duration growth needs stable earnings, not just lower rates or softer CPI.",
    ratesLiquidity:
      "Liquidity and real yields determine how fast macro signals pass through to multiples.",
    positioningNarrative:
      "Crowded trades can amplify moves when the interpretation shifts.",
    keyDrivers: ["Expectations", "Earnings", "Liquidity", "Positioning"],
    summary: "",
  };
  fallback.summary = fallback.directAnswer;
  return fallback;
}

/**
 * @param {MacroInterpretation} model
 */
export function buildMacroInterpretationCards(model) {
  return {
    title: `Macro Interpretation · ${model.label}`,
    directAnswer: concise(model.directAnswer, 360),
    summary: concise(model.summary || model.directAnswer, 320),
    cards: {
      snapshot: concise(model.directAnswer, 360),
      catalyst: concise(model.expectations, 200),
      macroContext: concise(model.growthEarnings, 200),
      sectorImpact: concise(model.positioningNarrative, 200),
      volatility: concise(model.ratesLiquidity, 200),
      aiSummary: concise(model.summary || model.directAnswer, 260),
    },
    optionalCards: {
      portfolioImpact: concise(model.ratesLiquidity, 180),
    },
    keyDrivers: model.keyDrivers,
    signals: ["Conceptual macro", "Context-dependent", model.label],
    confidence: 68,
    sources: ["Brieftick Logic · Macro Interpretation"],
  };
}

export { INTERPRETATION_LIBRARY };
