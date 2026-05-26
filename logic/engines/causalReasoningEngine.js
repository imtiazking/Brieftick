/**
 * Causal reasoning engine — mechanism-first sector/market inference.
 * Headlines support reasoning; they do not replace it.
 *
 * @module logic/engines/causalReasoningEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

/**
 * @typedef {Object} CausalModel
 * @property {string} id
 * @property {string} label
 * @property {string} cause
 * @property {string[]} firstOrderEffects
 * @property {string[]} secondOrderEffects
 * @property {string[]} sectorWinners
 * @property {string[]} sectorLosers
 * @property {string} pricingPowerShift
 * @property {string} macroTransmission
 * @property {string} supplyChainNote
 */

const CAUSAL_LIBRARY = [
  {
    id: "shipping_normalization",
    patterns:
      /shipping route|route(s)? normal|freight (cost|rate|price).*(fall|drop|ease|lower)|normaliz(e|ation).*(ship|freight|route)|red sea.*(ease|reopen)|container rate/i,
    label: "Shipping route normalization",
    cause: "Shipping routes normalize and freight costs ease",
    firstOrder: [
      "Lower ocean freight and insurance premia",
      "Shorter transit times and fewer diversion delays",
      "Improved inventory flow for importers",
    ],
    secondOrder: [
      "Margin relief for retailers and manufacturers with long supply chains",
      "Potential goods disinflation impulse with a lag",
      "Working-capital efficiency improves as lead times shorten",
    ],
    winners: [
      "Retailers and broadline consumer names importing finished goods",
      "Automotive and industrial manufacturers with global BOM exposure",
      "Consumer discretionary with high shipping-intensity margins",
    ],
    losers: [
      "Container shipping lines and freight forwarders",
      "Logistics firms that priced disruption and scarcity",
      "Some port handlers if pricing mix reverts to pre-shock competition",
    ],
    pricingPower:
      "Shipping and logistics lose pricing power; retailers and manufacturers may regain margin leverage over time.",
    macro:
      "Macro transmission runs through goods prices and cyclical risk appetite — supportive for importers before it compresses transport margins.",
    supply:
      "Supply chain stress eases from transit risk to inventory normalization; watch for oversupply in transport capacity.",
  },
  {
    id: "shipping_disruption",
    patterns:
      /shipping disruption|port congestion|canal|strait.*(close|block)|freight spike|red sea attack|supply chain shock/i,
    label: "Shipping / logistics disruption",
    cause: "Shipping disruption raises freight costs and elongates lead times",
    firstOrder: [
      "Higher freight and rerouting costs",
      "Inventory delays and safety-stock rebuilds",
    ],
    secondOrder: [
      "Margin pressure for importers; potential shelf gaps",
      "Inflationary pressure in goods categories",
    ],
    winners: ["Energy and defense when geopolitically linked", "Domestic producers with local supply advantage"],
    losers: [
      "Retailers and manufacturers importing on thin margins",
      "Airlines and transport users facing fuel + freight headwinds",
    ],
    pricingPower: "Logistics providers may gain short-term pricing power; downstream retailers lose it.",
    macro: "Stagflationary risk rises if disruption persists; vol may expand.",
    supply: "Just-in-time models break first; diversification and near-shoring narratives strengthen.",
  },
  {
    id: "oil_decline",
    patterns:
      /oil (price|prices)? (fall|drop|decline|slide)|crude (crash|selloff)|lower oil|oil eases/i,
    label: "Oil prices decline",
    cause: "Oil prices fall on supply surplus or demand worry",
    firstOrder: ["Lower energy input costs", "Gasoline relief for consumers"],
    secondOrder: [
      "Energy sector earnings pressure",
      "Support for transport, airlines, and chemical users",
    ],
    winners: ["Airlines", "Transport", "Chemicals and plastics users", "Consumer discretionary"],
    losers: ["Exploration & production", "Oilfield services", "Energy-heavy indices tilt"],
    pricingPower: "Energy producers lose pricing power; energy-consuming sectors may regain it.",
    macro: "Disinflationary impulse may ease rate pressure with a lag.",
    supply: "Pass-through to goods CPI is uneven by region and hedging.",
  },
  {
    id: "oil_spike",
    patterns:
      /oil (spike|surge|rally)|crude jumps|higher oil|oil shock/i,
    label: "Oil prices rise",
    cause: "Oil prices spike on supply fear or demand strength",
    firstOrder: ["Higher fuel and input costs", "Inflation expectations may reprice"],
    secondOrder: ["Margin squeeze for transport and consumers", "Energy equities re-rate"],
    winners: ["Integrated energy", "Refiners in some configurations", "Inflation hedges"],
    losers: ["Airlines", "Trucking", "Rate-sensitive growth", "Import-heavy economies"],
    pricingPower: "Energy gains pricing power; downstream consumers lose it.",
    macro: "Rates may stay restrictive longer; risk assets can de-rate if growth hurt.",
    supply: "Freight fuel surcharges return; inventory carrying costs rise.",
  },
  {
    id: "rates_fall",
    patterns:
      /rates (fall|drop|decline|cut)|yield(s)? (fall|drop)|fed cut|easier policy|lower for longer/i,
    label: "Rates move lower",
    cause: "Interest rates and yields decline",
    firstOrder: ["Lower discount rates", "Easier financial conditions"],
    secondOrder: ["Multiple expansion in long-duration growth", "Refinancing relief for leveraged issuers"],
    winners: ["Long-duration growth", "REITs", "Small caps if growth intact", "Housing-related chain"],
    losers: ["Banks if NIM compresses", "Cash-heavy low-beta if reflation"],
    pricingPower: "Borrowers regain pricing power vs savers; duration assets benefit.",
    macro: "Dollar may soften; EM assets may attract flows.",
    supply: "Housing and autos sensitive to mortgage/auto rates.",
  },
  {
    id: "rates_rise",
    patterns:
      /rates (rise|increase|hike)|yield(s)? (rise|spike)|higher for longer|hawkish fed/i,
    label: "Rates move higher",
    cause: "Interest rates and yields rise",
    firstOrder: ["Higher discount rates", "Tighter financial conditions"],
    secondOrder: ["Growth multiple compression", "Credit spread differentiation"],
    winners: ["Banks if curve steepens with growth", "Value and cash-flow quality"],
    losers: ["Long-duration tech", "Utilities", "Highly leveraged cyclicals"],
    pricingPower: "Savers and short-duration benefit; leveraged growth loses pricing power.",
    macro: "Dollar may firm; EM faces headwinds.",
    supply: "Housing turnover slows; capex may delay.",
  },
  {
    id: "inflation_cooling",
    patterns:
      /inflation (cool|ease|fall)|disinflation|cpi (fall|miss)|prices ease/i,
    label: "Inflation cools",
    cause: "Inflation pressures ease",
    firstOrder: ["Real income relief", "Lower terminal rate expectations"],
    secondOrder: ["Support for bonds and duration", "Consumer discretionary demand"],
    winners: ["Consumer staples/discretionary", "Long bonds", "Growth if soft landing"],
    losers: ["Commodity pure-plays if demand soft", "TIPS if breakevens compress"],
    pricingPower: "Consumers regain leverage; commodity sellers may lose it.",
    macro: "Policy pivot expectations can lift risk assets.",
    supply: "Inventory restocking becomes cheaper.",
  },
  {
    id: "dollar_strength",
    patterns:
      /dollar (strength|strong|rally|firm)|dxy (rise|up)|strong usd/i,
    label: "US dollar strengthens",
    cause: "The US dollar strengthens",
    firstOrder: ["Imported goods cheaper in USD", "EM debt stress for dollar borrowers"],
    secondOrder: ["Multinational earnings translation headwind", "Commodity pressure in USD terms"],
    winners: ["US domestic consumers", "Importers priced in USD"],
    losers: ["EM equities and dollar debt issuers", "Multinational exporters"],
    pricingPower: "US importers gain; exporters and EM lose pricing power abroad.",
    macro: "Fed reaction function may ease if import disinflation.",
    supply: "Global trade rebalances toward dollar-invoice winners.",
  },
  {
    id: "pricing_power_general",
    patterns:
      /pricing power|margin (expand|compression)|pass through|who loses pricing|who gains pricing/i,
    label: "Pricing power shift",
    cause: "Relative pricing power shifts between producers and consumers",
    firstOrder: ["Margin winners absorb or pass costs", "Losers face volume vs price trade-offs"],
    secondOrder: ["Sector rotation toward pricing-power leaders", "Estimate revisions diverge"],
    winners: ["Brands with inelastic demand", "Oligopolistic suppliers"],
    losers: ["Commoditized intermediaries", "High beta demand-sensitive names"],
    pricingPower: "Winners set price; losers discount to hold share.",
    macro: "Inflation path depends on who retains power.",
    supply: "Inventory cycles amplify winners/losers.",
  },
  {
    id: "trade_normalization",
    patterns:
      /trade normal|tariff (cut|ease)|trade deal|reshoring|nearshor|onshor|deglobal/i,
    label: "Trade / localization shift",
    cause: "Trade policy or supply geography shifts",
    firstOrder: ["Regional supply chains rewire", "Input cost curves change by locale"],
    secondOrder: ["Winners in host manufacturing regions", "Losers in disrupted export hubs"],
    winners: ["Domestic industrials", "Automation and capex suppliers"],
    losers: ["Export-heavy EM manufacturing", "Pure offshore logistics plays"],
    pricingPower: "Localized producers may gain; tariff-exposed importers lose.",
    macro: "Productivity and inflation trade-offs play out over years.",
    supply: "Dual sourcing raises resilience, not always lowest cost.",
  },
];

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function isCausalReasoningQuery(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t || t.length < 20) return false;
  if (
    /latest\s+(on|about)|what.?'?s the latest|update on|breaking news|headline today/i.test(t)
  ) {
    return false;
  }

  const asksMechanism =
    /which sector|what sector|who benefit|who loses|winners?|losers?|benefit first|lose first|pricing power|first.order|second.order|transmission|market effect|mechanism|how would|what happens to|impact on sector|sector(s)? (win|lose|gain)/i.test(
      t
    );

  const hasCausalTrigger =
    /if |when |should |normalize|normalise|ease|decline|rise|fall|spike|cut|hike|disrupt|shock|supply chain|shipping|freight|logistics|oil |rates |inflation|dollar|tariff|trade route|commodity/i.test(
      t
    );

  const supplyPricing =
    /supply chain|shipping|freight|logistics|pricing power|trade normal|container|port /i.test(t) &&
    /which|who|benefit|lose|impact|effect|sector/i.test(t);

  return (asksMechanism && hasCausalTrigger) || supplyPricing;
}

/**
 * @param {string} prompt
 * @returns {CausalModel}
 */
export function runCausalReasoningEngine(prompt) {
  const t = (prompt || "").trim();
  let matched = null;
  for (const def of CAUSAL_LIBRARY) {
    if (def.patterns.test(t)) {
      matched = def;
      break;
    }
  }
  if (!matched) {
    matched = {
      id: "general_causal",
      label: "Causal market question",
      patterns: /.*/,
      cause: "The shock or shift described in the question",
      firstOrder: ["First-order repricing in directly exposed assets"],
      secondOrder: ["Second-order effects spread via margins, volumes, and factor rotation"],
      winners: ["Sectors with structural tailwinds to the shock"],
      losers: ["Sectors structurally hurt by the shock"],
      pricingPower: "Pricing power rotates toward beneficiaries and away from impaired intermediaries.",
      macro: "Macro transmission depends on whether the shock is inflationary, growth-negative, or both.",
      supply: "Supply chain linkages determine how fast effects reach downstream sectors.",
    };
  }

  /** @type {CausalModel} */
  const model = {
    id: matched.id,
    label: matched.label,
    cause: matched.cause,
    firstOrderEffects: matched.firstOrder,
    secondOrderEffects: matched.secondOrder,
    sectorWinners: matched.winners,
    sectorLosers: matched.losers,
    pricingPowerShift: matched.pricingPower,
    macroTransmission: matched.macro,
    supplyChainNote: matched.supply,
  };

  logicDebug("causalReasoningEngine", { id: model.id, label: model.label });
  return model;
}

/**
 * Build mechanism-first cards from causal model.
 * @param {CausalModel} model
 * @param {string} prompt
 * @param {string} [headlineSupport]
 */
export function buildCausalCards(model, prompt, headlineSupport) {
  const winners = model.sectorWinners.slice(0, 4).join("; ");
  const losers = model.sectorLosers.slice(0, 4).join("; ");

  const directAnswer = concise(
    `${model.cause}: ${model.pricingPowerShift} Early beneficiaries often include ${model.sectorWinners[0]?.toLowerCase() || "exposed winners"}; ${model.sectorLosers[0]?.toLowerCase() || "losers"} tend to lose pricing power first.`,
    340
  );

  const catalyst = concise(
    `Cause → ${model.firstOrderEffects[0]} → ${model.secondOrderEffects[0] || model.macroTransmission}`,
    220
  );

  const macroContext = concise(model.macroTransmission, 200);
  const sectorImpact = concise(`Winners: ${winners}`, 200);
  const volOutlook = concise(
    "Vol may rise if the shift surprises positioning; otherwise dispersion widens more than index vol.",
    180
  );
  const summary = concise(
    `${model.cause}. ${model.pricingPowerShift} ${model.secondOrderEffects[0] || ""}`,
    280
  );

  const headlineNote = headlineSupport
    ? concise(`Context (headlines): ${headlineSupport}`, 160)
    : "";

  return {
    title: `Causal Logic · ${model.label}`,
    directAnswer,
    summary,
    cards: {
      snapshot: directAnswer,
      catalyst,
      macroContext,
      sectorImpact,
      volatility: volOutlook,
      aiSummary: summary,
    },
    optionalCards: {
      sectorRisks: concise(`Losers: ${losers}`, 200),
      portfolioImpact: concise(model.supplyChainNote, 200),
      relatedMovers: headlineNote || undefined,
    },
    keyDrivers: [
      model.cause,
      model.firstOrderEffects[0],
      model.pricingPowerShift,
    ],
    signals: [
      `Winners: ${model.sectorWinners[0] || "TBD"}`,
      `Losers: ${model.sectorLosers[0] || "TBD"}`,
      "Mechanism-first",
    ],
  };
}

export { CAUSAL_LIBRARY };
