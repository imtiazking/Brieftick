/**
 * Source routing — maps Logic intent to data providers.
 * @module logic/sourceRouter
 */

import { logicDebug } from "./shared.js";

/** @typedef {'quote'|'news'|'macro'|'portfolio'|'risk'|'sector'|'earnings'} DataIntent */

/**
 * @typedef {Object} SourceRoute
 * @property {DataIntent[]} intents
 * @property {string[]} providers
 * @property {{ provider: string, intent: DataIntent, priority: number }[]} routes
 */

const PROVIDER_META = {
  finnhub: { label: "Finnhub", types: ["quote", "news", "earnings"] },
  twelvedata: { label: "Twelve Data", types: ["quote"] },
  polygon: { label: "Polygon", types: ["quote"] },
  anthropic: { label: "Anthropic", types: ["enrichment"] },
  macro: { label: "Macro Feed", types: ["macro", "risk"] },
  portfolio: { label: "Portfolio Context", types: ["portfolio"] },
  brieftick: { label: "Brieftick Logic", types: ["fallback"] },
};

/**
 * @param {{ prompt: string, mode: import('./types.js').LogicMode, primaryEntity: import('./entityResolver.js').ResolvedEntity }} params
 * @returns {SourceRoute}
 */
export function routeSources({ prompt, mode, primaryEntity }) {
  /** @type {Set<DataIntent>} */
  const intents = new Set();
  const t = (prompt || "").toLowerCase();

  switch (mode) {
    case "ticker":
      intents.add("quote");
      intents.add("news");
      if (/earnings|guidance|eps/i.test(t)) intents.add("earnings");
      break;
    case "portfolio":
      intents.add("portfolio");
      intents.add("quote");
      intents.add("risk");
      break;
    case "risk-regime":
      intents.add("risk");
      intents.add("macro");
      intents.add("news");
      break;
    case "sector-rotation":
      intents.add("sector");
      intents.add("quote");
      intents.add("news");
      break;
    case "scenario":
      intents.add("macro");
      intents.add("news");
      break;
    case "daily-brief":
      intents.add("news");
      intents.add("macro");
      intents.add("quote");
      break;
    case "market-pulse":
    default:
      intents.add("news");
      intents.add("macro");
      intents.add("quote");
      break;
  }

  if (primaryEntity?.entityType === "macro") intents.add("macro");
  if (/news|headline|latest/i.test(t)) intents.add("news");
  if (/price|moving|quote|%/i.test(t)) intents.add("quote");

  const api = typeof window !== "undefined" ? window.BriefTickAPI : null;
  const routes = /** @type {SourceRoute["routes"]} */ ([]);

  const add = (provider, intent, priority) => {
    routes.push({ provider, intent, priority });
  };

  if (intents.has("quote")) {
    if (api?.keys?.finnhub) add("finnhub", "quote", 1);
    if (api?.keys?.twelvedata) add("twelvedata", "quote", 2);
    if (api?.keys?.polygon) add("polygon", "quote", 3);
  }
  if (intents.has("news") || intents.has("earnings")) {
    if (api?.keys?.finnhub) add("finnhub", "news", 1);
  }
  if (intents.has("macro") || intents.has("risk")) {
    add("macro", "macro", 1);
    if (api?.keys?.finnhub) add("finnhub", "news", 2);
  }
  if (intents.has("portfolio")) add("portfolio", "portfolio", 1);
  add("brieftick", "macro", 99);

  const providers = [...new Set(routes.map((r) => r.provider))];
  const route = { intents: [...intents], providers, routes };
  logicDebug("source_selected", {
    mode,
    intents: route.intents,
    providers: route.providers,
  });
  return route;
}

export function formatSourceAttribution(providers, failed = []) {
  const labels = providers
    .filter((p) => p !== "brieftick")
    .map((p) => PROVIDER_META[p]?.label || p)
    .slice(0, 4);
  if (!labels.length) return ["Brieftick Logic"];
  const out = [...labels, "Brieftick Logic"];
  if (failed.length) return out;
  return [...new Set(out)];
}
