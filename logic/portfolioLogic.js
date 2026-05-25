import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getPortfolioHoldings,
  getQuote,
  withDataLimited,
  buildFusionPromptExtras,
} from "./shared.js";
import { fusionAttributionSources } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";

/** @param {{ prompt: string, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx */
export async function runPortfolioLogic(ctx) {
  const prompt = ctx.prompt || "Analyze my portfolio";
  const failedSources = [...(ctx.fusion?.failedSources || [])];
  const holdings = getPortfolioHoldings();
  const lines =
    holdings.length > 0
      ? holdings
      : [
          { symbol: "NVDA", weight: 18 },
          { symbol: "AAPL", weight: 12 },
          { symbol: "MSFT", weight: 10 },
        ];

  const quotes = {};
  for (const h of lines.slice(0, 8)) {
    const { quote, failedSources: fs } = await getQuote(h.symbol);
    quotes[h.symbol] = quote;
    failedSources.push(...fs);
  }

  const top3 = [...lines].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 3);
  const top3Weight = top3.reduce((s, h) => s + (h.weight || 0), 0);

  const bookCtx = lines
    .map((h) => {
      const q = quotes[h.symbol];
      const ch = q ? `${q.pctChange >= 0 ? "+" : ""}${q.pctChange.toFixed(2)}%` : "—";
      return `${h.symbol} ${h.weight || "?"}% (day ${ch})`;
    })
    .join("\n");

  const ai = await callLogicLLM(
    "Brieftick Portfolio Logic — composition, concentration, vol exposure, macro sensitivity. Never recommend trades.",
    `${prompt}\nHoldings:\n${bookCtx}\nTop3 weight: ${top3Weight}%\n${buildFusionPromptExtras(ctx, top3[0]?.symbol || "SPY")}`,
    700
  );

  if (ai) {
    return {
      ...ai,
      mode: "portfolio",
      mockData: !holdings.length,
      sources: ctx.fusion ? fusionAttributionSources(ctx.fusion) : ai.sources,
      optionalCards: {
        portfolioImpact: `Concentration in ${top3.map((h) => h.symbol).join(", ")} (~${top3Weight.toFixed(0)}% top-3) · macro and vol transmission elevated`,
        riskSignal: top3Weight > 35 ? "Correlation risk elevated" : "Moderate book diversification",
      },
    };
  }

  if (!holdings.length && failedSources.length > 4) return buildFallbackResponse(ctx);

  return withDataLimited(
    {
      title: "Portfolio Logic snapshot",
      summary: `Book shows ${lines.length} positions with largest weights in ${top3.map((h) => h.symbol).join(", ")}. Top-three concentration near ${top3Weight.toFixed(0)}% raises sensitivity to sector shocks and headline risk.`,
      cards: {
        snapshot: `Top weights: ${top3.map((h) => h.symbol).join(", ")}`,
        catalyst: "Single-name and sector headlines drive day-over-day variance",
        macroContext: "Rates and volatility channel affect growth-heavy books",
        sectorImpact: "Technology / growth exposure likely elevated",
        volatility: top3Weight > 35 ? "Concentration elevates vol sensitivity" : "Moderate diversification",
        aiSummary: `Exposure is concentrated in ${top3.map((h) => h.symbol).join(", ")} with macro and vol as the main risk transmitters.`,
      },
      keyDrivers: [
        `Top weights: ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")}`,
        "Growth / technology factor tilt",
        "Macro rate channel",
      ],
      signals: [
        top3Weight > 35 ? "Concentration elevated" : "Diversification moderate",
        "Monitor vol sensitivity",
      ],
      confidence: holdings.length ? 68 : 54,
      sources: ctx.fusion
        ? fusionAttributionSources(ctx.fusion)
        : holdings.length
          ? ["Portfolio Context", "Finnhub", "Brieftick Logic"]
          : ["Sample book · Brieftick Logic"],
      mode: "portfolio",
      mockData: !holdings.length,
      optionalCards: {
        portfolioImpact: `Largest weights ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")} — sector balance and macro beta drive book volatility.`,
      },
    },
    failedSources
  );
}
