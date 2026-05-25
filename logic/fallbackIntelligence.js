/**
 * Fallback intelligence — always returns structured cards when live data fails.
 * @module logic/fallbackIntelligence
 */

import { buildLogicResponse, LIMITED_DATA_MSG, LOGIC_DISCLAIMER } from "./types.js";
import { resolveSymbolForPrompt, MOCK_HEADLINES } from "./shared.js";
import { fusionAttributionSources, getFusedQuote } from "./dataFusion.js";
import { buildMemoryContext } from "./watchlistMemory.js";

const SECTOR_NARRATIVES = {
  NVDA: "AI infrastructure and semiconductor supply chain",
  AAPL: "Consumer technology ecosystem and services mix",
  TSLA: "EV adoption, margin narrative, and macro rate sensitivity",
  SPY: "Broad U.S. equity beta and macro policy channel",
  QQQ: "Growth / mega-cap technology factor exposure",
};

/**
 * @param {{ prompt: string, mode: import('./types.js').LogicMode, primaryEntity: import('./entityResolver.js').ResolvedEntity, fusion?: import('./dataFusion.js').FusionBundle }} ctx
 */
export function buildFallbackResponse(ctx) {
  const { prompt, mode, primaryEntity, fusion } = ctx;
  const symbol = resolveSymbolForPrompt(prompt, primaryEntity);
  const name = primaryEntity?.companyName || symbol;
  const memory = buildMemoryContext(primaryEntity, mode);
  const headlines =
    fusion?.relatedHeadlines?.length
      ? fusion.relatedHeadlines
      : fusion?.news?.headlines?.length
        ? fusion.news.headlines
        : MOCK_HEADLINES;

  const fq = fusion ? getFusedQuote(fusion, symbol) : null;
  const pctStr =
    fq?.pctChange != null
      ? `${fq.pctChange >= 0 ? "+" : ""}${fq.pctChange.toFixed(2)}%`
      : null;

  const sectorLine =
    SECTOR_NARRATIVES[symbol] ||
    (primaryEntity?.entityType === "sector_theme"
      ? primaryEntity.companyName
      : "Sector sympathy and factor rotation");

  const titleByMode = {
    ticker: `${name} (${symbol}) · Contextual intelligence`,
    "market-pulse": "Market Pulse · Contextual read",
    "risk-regime": "Risk Regime · Contextual read",
    portfolio: "Portfolio Logic · Contextual exposure",
    "sector-rotation": "Sector Rotation · Narrative lens",
    "daily-brief": "Daily Brief · Session context",
    scenario: "Scenario Logic · Hypothetical framing",
  };

  const summaryParts = [
    LIMITED_DATA_MSG,
    pctStr
      ? `${name} session change near ${pctStr} — read through headlines and macro.`
      : `${name} is in focus; historical patterns and sector narrative anchor the read.`,
    memory.hint || "",
  ];

  const catalyst =
    headlines[0]?.headline ||
    "Headline and policy channel remain the primary catalyst surface";

  return buildLogicResponse({
    title: titleByMode[mode] || "Brieftick Logic · Intelligence",
    summary: summaryParts.filter(Boolean).join(" "),
    cards: {
      snapshot: pctStr
        ? `${symbol} ${pctStr} — ${memory.hint ? "watchlist-relevant move" : "tape in focus"}`
        : `${name} — contextual snapshot while live feeds reconnect`,
      catalyst,
      macroContext:
        "Rates, inflation path, and central-bank tone remain the cross-asset anchor; dollar and yields shape risk appetite.",
      sectorImpact: sectorLine,
      volatility:
        fq?.pctChange != null && Math.abs(fq.pctChange) > 2
          ? "Elevated single-name volatility vs recent range"
          : "Volatility monitored; regime shifts tied to macro data",
      aiSummary: `Even with limited live confirmation, ${name} can be read through historical sector behavior, macro backdrop, and headline sensitivity — not isolated price action alone.`,
    },
    keyDrivers: [
      catalyst.slice(0, 80),
      "Macro rates / policy channel",
      sectorLine.slice(0, 80),
    ],
    signals: [
      fusion?.live ? "Partial live data" : "Contextual mode",
      memory.themes?.[0] ? `Theme: ${memory.themes[0]}` : "Macro monitored",
    ],
    confidence: fusion?.live ? 48 : 38,
    sources: fusion
      ? fusionAttributionSources(fusion, mode)
      : ["Brieftick Logic", "Macro Feed"],
    disclaimer: LOGIC_DISCLAIMER,
    mode,
    dataLimited: true,
    mockData: !fusion?.live,
    failedSources: fusion?.failedSources || [],
    optionalCards: {
      riskSignal: mode === "risk-regime" ? "Risk channel: macro + vol in focus" : undefined,
      relatedMovers: memory.watchlist?.length
        ? `Names to monitor alongside ${symbol}: ${memory.watchlist.slice(0, 4).join(", ")}`
        : undefined,
      portfolioImpact: memory.holdings?.length
        ? `Portfolio overlap may amplify moves in ${symbol}.`
        : undefined,
    },
  });
}
