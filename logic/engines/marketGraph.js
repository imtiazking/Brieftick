/**
 * Market graph — chained cross-asset transmission paths.
 * Reusable by all Logic modules.
 *
 * @module logic/engines/marketGraph
 */

import { logicDebug } from "../shared.js";

/** @typedef {{ step: string, order: 1|2 }} GraphStep */
/** @typedef {{ id: string, label: string, trigger: string, steps: GraphStep[], assets: string[] }} TransmissionChain */

/** @type {Record<string, string[]>} */
const NODE_NEIGHBORS = {
  oil: ["inflation", "yields", "equities", "volatility", "commodities"],
  inflation: ["yields", "fed", "equities", "volatility", "consumer"],
  yields: ["equities", "volatility", "currencies", "financials", "growth"],
  volatility: ["equities", "risk_assets", "defensives"],
  equities: ["sectors", "volatility", "currencies"],
  shipping: ["inflation", "consumer", "industrials", "logistics"],
  ai: ["semiconductors", "equities", "momentum", "volatility"],
  currencies: ["commodities", "em", "equities"],
  macro: ["yields", "inflation", "equities"],
  commodities: ["inflation", "em", "energy"],
  defensives: ["volatility", "equities"],
  growth: ["yields", "volatility", "ai"],
};

/** @type {TransmissionChain[]} */
const CHAIN_LIBRARY = [
  {
    id: "oil_spike",
    label: "Oil spike transmission",
    trigger: /oil (spike|surge|rally|shock)|crude (jump|rise)|higher oil/i,
    assets: ["oil", "inflation", "yields", "equities", "volatility"],
    steps: [
      { order: 1, step: "Oil prices rise → energy input costs increase" },
      { order: 1, step: "Inflation expectations reprice higher" },
      { order: 2, step: "Bond yields rise on inflation pressure" },
      { order: 2, step: "Growth stocks weaken on higher discount rates" },
      { order: 2, step: "Volatility increases; defensives may outperform" },
    ],
  },
  {
    id: "shipping_normalize",
    label: "Shipping normalization",
    trigger: /shipping.*normal|freight (fall|drop|ease)|route(s)? normal/i,
    assets: ["shipping", "inflation", "consumer", "equities"],
    steps: [
      { order: 1, step: "Freight costs fall → importer input costs ease" },
      { order: 1, step: "Inventory flow and lead times improve" },
      { order: 2, step: "Retailer/manufacturer margins improve" },
      { order: 2, step: "Goods inflation pressure eases with a lag" },
      { order: 2, step: "Consumer discretionary and importers benefit" },
    ],
  },
  {
    id: "rates_rise",
    label: "Rates higher transmission",
    trigger: /rates (rise|hike)|yields? (rise|spike)|hawkish|higher for longer/i,
    assets: ["yields", "equities", "volatility", "growth"],
    steps: [
      { order: 1, step: "Yields rise → financial conditions tighten" },
      { order: 2, step: "Duration-sensitive growth de-rates" },
      { order: 2, step: "Volatility expands; factor rotation toward quality/cash-flow" },
    ],
  },
  {
    id: "rates_fall",
    label: "Rates lower transmission",
    trigger: /rates (fall|cut)|yields? (fall|drop)|dovish|fed cut/i,
    assets: ["yields", "equities", "growth", "volatility"],
    steps: [
      { order: 1, step: "Yields fall → discount rates ease" },
      { order: 2, step: "Long-duration growth and housing chain support" },
      { order: 2, step: "Volatility may compress if growth intact" },
    ],
  },
  {
    id: "inflation_cool",
    label: "Disinflation transmission",
    trigger: /inflation (cool|ease|fall)|disinflation|cpi (miss|fall)/i,
    assets: ["inflation", "yields", "equities", "consumer"],
    steps: [
      { order: 1, step: "Inflation cools → real income relief" },
      { order: 2, step: "Rate-cut expectations may rise" },
      { order: 2, step: "Consumer and duration assets supported" },
    ],
  },
  {
    id: "geopolitical_stress",
    label: "Geopolitical stress",
    trigger: /iran|war|conflict|sanctions|strike|middle east|geopolit/i,
    assets: ["oil", "volatility", "defensives", "currencies"],
    steps: [
      { order: 1, step: "Geopolitical shock → oil/defense risk premia" },
      { order: 2, step: "Safe havens and vol bid; risk assets gap" },
      { order: 2, step: "EM and travel-linked sectors lag" },
    ],
  },
  {
    id: "ai_momentum",
    label: "AI momentum chain",
    trigger: /\bai\b|semiconductor|nvidia|hyperscaler|mega.?cap tech/i,
    assets: ["ai", "semiconductors", "equities", "volatility"],
    steps: [
      { order: 1, step: "AI capex narrative drives semi/infra leadership" },
      { order: 2, step: "Index concentration rises; breadth narrows" },
      { order: 2, step: "Vol tied to mega-cap gaps; rotation risk if narrative fades" },
    ],
  },
  {
    id: "risk_off",
    label: "Risk-off unwind",
    trigger: /risk.?off|vix spike|selloff|flight to quality/i,
    assets: ["volatility", "yields", "defensives", "equities"],
    steps: [
      { order: 1, step: "Risk appetite falls → equities sell" },
      { order: 2, step: "Bonds/gold bid; cyclicals underperform" },
      { order: 2, step: "Vol rises; correlations spike" },
    ],
  },
];

/**
 * @param {string} prompt
 * @returns {TransmissionChain | null}
 */
export function matchTransmissionChain(prompt) {
  const t = prompt || "";
  for (const chain of CHAIN_LIBRARY) {
    if (chain.trigger.test(t)) return chain;
  }
  return null;
}

/**
 * @param {string} nodeId
 * @returns {string[]}
 */
export function getRelatedNodes(nodeId) {
  return NODE_NEIGHBORS[nodeId] || [];
}

/**
 * @param {string} prompt
 * @param {string} [questionKind]
 * @returns {{ chain: TransmissionChain | null, firstOrder: string[], secondOrder: string[], narrative: string }}
 */
export function resolveMarketGraph(prompt, questionKind) {
  let chain = matchTransmissionChain(prompt);
  if (!chain && questionKind) {
    const kindMap = {
      geopolitical: "geopolitical_stress",
      commodities: "oil_spike",
      rates: "rates_rise",
      causal: "shipping_normalize",
      supply_chain: "shipping_normalize",
    };
    const id = kindMap[questionKind];
    chain = CHAIN_LIBRARY.find((c) => c.id === id) || null;
  }

  if (!chain) {
    return {
      chain: null,
      firstOrder: [],
      secondOrder: [],
      narrative: "",
    };
  }

  const firstOrder = chain.steps.filter((s) => s.order === 1).map((s) => s.step);
  const secondOrder = chain.steps.filter((s) => s.order === 2).map((s) => s.step);
  const narrative = chain.steps.map((s) => s.step).join(" → ");

  logicDebug("marketGraph", { id: chain.id, steps: chain.steps.length });

  return { chain, firstOrder, secondOrder, narrative };
}

/**
 * Enrich response cards with graph transmission (non-destructive).
 * @param {import('../types.js').LogicResponse} res
 * @param {{ narrative?: string, firstOrder?: string[], secondOrder?: string[] }} graph
 */
export function applyGraphToResponse(res, graph) {
  if (!graph?.narrative) return res;
  const cards = { ...(res.cards || {}) };
  if (!cards.macroContext || /policy and inflation path dominate/i.test(cards.macroContext)) {
    cards.macroContext = graph.firstOrder?.[0] || graph.narrative.slice(0, 200);
  }
  if (graph.secondOrder?.[0] && (!cards.sectorImpact || cards.sectorImpact.length < 40)) {
    cards.sectorImpact = graph.secondOrder.slice(0, 2).join(" ");
  }
  return {
    ...res,
    cards,
    graphChain: graph.narrative,
    keyDrivers: [...(res.keyDrivers || []), graph.firstOrder?.[0]].filter(Boolean).slice(0, 4),
  };
}

export { CHAIN_LIBRARY, NODE_NEIGHBORS };
