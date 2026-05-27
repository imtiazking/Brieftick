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
import { resolvePortfolioContext } from "./engines/inferredPortfolioContext.js";

/** @param {{ prompt: string, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx */
export async function runPortfolioLogic(ctx) {
  const prompt = ctx.prompt || "Analyze my portfolio";
  const failedSources = [...(ctx.fusion?.failedSources || [])];
  const portfolioCtx = ctx.portfolioContext || resolvePortfolioContext();
  const lines = portfolioCtx.holdings?.length
    ? portfolioCtx.holdings
    : ctx.portfolioMemory?.holdings?.length
      ? ctx.portfolioMemory.holdings
      : getPortfolioHoldings();
  const hasRealBook =
    portfolioCtx.source === "explicit" || portfolioCtx.source === "inferred_watchlist";

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
        confidence: hasRealBook ? (portfolioCtx.isInferred ? 64 : 72) : 58,
        sources: ctx.fusion
          ? fusionAttributionSources(ctx.fusion)
          : hasRealBook
            ? portfolioCtx.isInferred
              ? ["Watchlist-derived portfolio", "Brieftick Logic"]
              : ["Portfolio Context", "Brieftick Logic"]
            : ["Sample book · Brieftick Logic"],
        mode: "portfolio",
        modeLabel: portfolioCtx.isInferred
          ? `Portfolio Logic · ${portfolioCtx.contextLabel}`
          : ctx.responsePlan?.label || shaped.title,
        mockData: !hasRealBook,
        portfolioAnswerShape: shaped.shape,
        portfolioContextSource: portfolioCtx.source,
        portfolioContextLabel: portfolioCtx.contextLabel,
        isInferredPortfolio: portfolioCtx.isInferred,
        optionalCards: {
          portfolioImpact: shaped.cards.sectorImpact || shaped.summary,
          riskSignal: shaped.signals[0] || "",
          portfolioContextLabel: portfolioCtx.contextLabel,
          inferredPortfolioProfile: portfolioCtx.isInferred
            ? `Inferred portfolio profile · ${portfolioCtx.contextLabel}`
            : undefined,
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
      mockData: !hasRealBook,
      portfolioContextSource: portfolioCtx.source,
      isInferredPortfolio: portfolioCtx.isInferred,
      sources: ctx.fusion ? fusionAttributionSources(ctx.fusion) : ai.sources,
      optionalCards: {
        portfolioImpact: shaped.cards.sectorImpact || ai.optionalCards?.portfolioImpact,
        riskSignal: shaped.signals[0] || ai.optionalCards?.riskSignal,
      },
    };
  }

  if (!hasRealBook && failedSources.length > 4) return buildFallbackResponse(ctx);

  return withDataLimited(
    {
      title: shaped.title,
      directAnswer: shaped.directAnswer,
      summary: shaped.summary,
      cards: shaped.cards,
      keyDrivers: shaped.keyDrivers,
      signals: shaped.signals,
      confidence: hasRealBook ? (portfolioCtx.isInferred ? 64 : 68) : 54,
      sources: ctx.fusion
        ? fusionAttributionSources(ctx.fusion)
        : hasRealBook
          ? portfolioCtx.isInferred
            ? ["Watchlist-derived portfolio", "Brieftick Logic"]
            : ["Portfolio Context", "Finnhub", "Brieftick Logic"]
          : ["Sample book · Brieftick Logic"],
      mode: "portfolio",
      modeLabel: portfolioCtx.isInferred
        ? `Portfolio Logic · ${portfolioCtx.contextLabel}`
        : ctx.responsePlan?.label,
      mockData: !hasRealBook,
      portfolioContextSource: portfolioCtx.source,
      isInferredPortfolio: portfolioCtx.isInferred,
      optionalCards: {
        portfolioImpact: `Largest weights ${top3.map((h) => `${h.symbol} ${h.weight}%`).join(", ")} — macro beta drives book volatility.`,
      },
    },
    failedSources
  );
}
