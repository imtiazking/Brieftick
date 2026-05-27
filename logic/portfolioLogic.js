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
import { shapePortfolioAnswer } from "./engines/portfolioAnswerShaper.js";
import { isValidWatchlistTicker } from "./engines/watchlistSymbols.js";
import { isWatchlistPerformanceQuery } from "./engines/userContext.js";

/** @param {{ prompt: string, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx */
export async function runPortfolioLogic(ctx) {
  if (isWatchlistPerformanceQuery(ctx.prompt || "")) {
    const { runWatchlistPerformanceLogic } = await import("./watchlistPerformanceLogic.js");
    return runWatchlistPerformanceLogic(ctx);
  }

  const prompt = ctx.prompt || "Analyze my portfolio";
  const failedSources = [...(ctx.fusion?.failedSources || [])];
  const ctxHoldings = ctx.portfolioContext?.holdings || ctx.portfolioMemory?.holdings;
  const domHoldings = getPortfolioHoldings();
  const holdings = domHoldings.length ? domHoldings : ctxHoldings?.length ? ctxHoldings : [];
  const lines =
    holdings.length > 0
      ? holdings.filter((h) => isValidWatchlistTicker(h.symbol))
      : [
          { symbol: "NVDA", weight: 18 },
          { symbol: "AAPL", weight: 12 },
          { symbol: "MSFT", weight: 10 },
        ];
  const usingSample = !holdings.length;

  const quotes = {};
  for (const h of lines.slice(0, 8)) {
    const { quote, failedSources: fs } = await getQuote(h.symbol);
    quotes[h.symbol] = quote;
    failedSources.push(...fs);
  }

  const top3 = [...lines].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 3);
  const top3Weight = top3.reduce((s, h) => s + (h.weight || 0), 0);

  const pint = analyzePortfolioIntelligence(ctx, ctx.marketIntelligence);
  const profile = pint.profile || ctx.portfolioMemory?.profile;
  const shaped = shapePortfolioAnswer(ctx, profile, pint, top3, top3Weight);

  if (shaped.useShapedAnswer) {
    return withDataLimited(
      {
        title: shaped.title,
        directAnswer: shaped.directAnswer,
        summary: shaped.summary,
        cards: shaped.cards,
        keyDrivers: shaped.keyDrivers,
        signals: shaped.signals,
        confidence: usingSample ? 58 : 72,
        sources: ctx.fusion
          ? fusionAttributionSources(ctx.fusion)
          : usingSample
            ? ["Sample book · Brieftick Logic"]
            : ["Portfolio Context", "Brieftick Logic"],
        mode: "portfolio",
        modeLabel: ctx.responsePlan?.label || shaped.title,
        mockData: usingSample,
        portfolioAnswerShape: shaped.shape,
        optionalCards: {
          portfolioImpact: shaped.cards.sectorImpact || shaped.summary,
          riskSignal: shaped.signals[0] || "",
        },
      },
      failedSources
    );
  }

  const bookCtx = lines
    .map((h) => {
      const q = quotes[h.symbol];
      const ch = q ? `${q.pctChange >= 0 ? "+" : ""}${q.pctChange.toFixed(2)}%` : "—";
      return `${h.symbol} ${h.weight || "?"}% (day ${ch})`;
    })
    .join("\n");

  const focus = shaped.llmFocus || prompt;
  const ai = await callLogicLLM(
    `Brieftick Portfolio Logic. Answer ONLY this question: "${focus}". Do not open with a generic AI concentration summary unless that is what was asked. Never recommend trades.`,
    `${prompt}\nHoldings:\n${bookCtx}\nTop3 weight: ${top3Weight}%\n${buildFusionPromptExtras(ctx, top3[0]?.symbol || "SPY")}`,
    700
  );

  if (ai?.directAnswer) {
    return {
      ...ai,
      mode: "portfolio",
      modeLabel: ctx.responsePlan?.label,
      mockData: !holdings.length,
      sources: ctx.fusion ? fusionAttributionSources(ctx.fusion) : ai.sources,
      optionalCards: {
        portfolioImpact: shaped.cards.sectorImpact || ai.optionalCards?.portfolioImpact,
        riskSignal: shaped.signals[0] || ai.optionalCards?.riskSignal,
      },
    };
  }

  if (!holdings.length && failedSources.length > 4) return buildFallbackResponse(ctx);

  return withDataLimited(
    {
      title: shaped.title,
      directAnswer: shaped.directAnswer,
      summary: shaped.summary,
      cards: shaped.cards,
      keyDrivers: shaped.keyDrivers,
      signals: shaped.signals,
      confidence: holdings.length ? 68 : 54,
      sources: ctx.fusion
        ? fusionAttributionSources(ctx.fusion)
        : holdings.length
          ? ["Portfolio Context", "Finnhub", "Brieftick Logic"]
          : ["Sample book · Brieftick Logic"],
      mode: "portfolio",
      mockData: !holdings.length,
      optionalCards: {
        portfolioImpact: `Largest weights ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")} — macro beta drives book volatility.`,
      },
    },
    failedSources
  );
}
