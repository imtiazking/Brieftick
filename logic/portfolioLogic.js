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
import { analyzePortfolioIntelligence } from "./engines/portfolioIntelligenceEngine.js";

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

  const pint = analyzePortfolioIntelligence(ctx, ctx.marketIntelligence);
  const profile = pint.profile || ctx.portfolioMemory?.profile;
  const expNotes = pint.exposures.map((e) => e.note).slice(0, 2).join(" ");

  return withDataLimited(
    {
      title: "Portfolio Logic",
      directAnswer: pint.headline,
      summary: pint.headline,
      cards: {
        snapshot: pint.headline,
        catalyst: pint.exposures[0]?.note || "Macro and headline channels drive book variance",
        macroContext:
          pint.exposures.find((e) => /rates/i.test(e.theme))?.note ||
          `Rates sensitivity: ${profile?.sensitivity?.rates || "moderate"}`,
        sectorImpact:
          pint.exposures.find((e) => /AI/i.test(e.theme))?.note ||
          `AI-weighted exposure ~${profile?.aiWeight || "—"}%`,
        volatility:
          pint.exposures.find((e) => /vol/i.test(e.theme))?.note ||
          (top3Weight > 35 ? "Concentration elevates vol sensitivity" : "Moderate vol channel"),
        aiSummary: expNotes || pint.headline,
      },
      keyDrivers: [
        `Top weights: ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")}`,
        profile?.growthDefensiveTilt || "Growth tilt",
        `AI ~${profile?.aiWeight || "—"}%`,
      ],
      signals: [
        ...(pint.warnings || []).slice(0, 2),
        ...(pint.personalizedNotes || []).slice(0, 1),
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
