import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  getQuote,
  logicDebug,
  resolveSymbolForPrompt,
  withDataLimited,
  MOCK_HEADLINES,
  buildFusionPromptExtras,
} from "./shared.js";
import { getFusedQuote, fusionAttributionSources } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";
import { humanizeLogicAnswer } from "./engines/conversationalVoice.js";

/**
 * @param {{ prompt: string, primaryEntity: import('./entityResolver.js').ResolvedEntity, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx
 */
export async function runTickerIntelligenceLogic(ctx) {
  const { prompt, primaryEntity, fusion } = ctx;
  const symbol = resolveSymbolForPrompt(prompt, primaryEntity);
  const displayName = primaryEntity.companyName || symbol;
  const failedSources = [...(fusion?.failedSources || [])];
  const api = window.BriefTickAPI;
  const isNewsQuery = /news|headline|latest|update/i.test(prompt);

  logicDebug("ticker_symbol", { symbol, displayName, isNewsQuery });

  const fq = fusion ? getFusedQuote(fusion, symbol) : null;
  let quote = fq
    ? { price: fq.price, pctChange: fq.pctChange }
    : null;

  if (!quote) {
    const { quote: q, failedSources: qf } = await getQuote(symbol);
    quote = q;
    failedSources.push(...qf);
  }

  const headlines =
    fusion?.relatedHeadlines?.length
      ? fusion.relatedHeadlines
      : fusion?.news?.headlines?.length
        ? fusion.news.headlines
        : (await getHeadlines(8)).headlines;

  if (!fusion?.news?.headlines?.length) {
    const pack = await getHeadlines(8);
    failedSources.push(...(pack.failedSources || []));
  }

  const items = headlines.length ? headlines : MOCK_HEADLINES;
  const newsCtx = items
    .slice(0, 4)
    .map((n) => n.headline)
    .join("; ");

  if (api?.aiWhyMoving && !isNewsQuery && quote) {
    try {
      const text = await api.aiWhyMoving(symbol);
      if (text) {
        const voice = humanizeLogicAnswer(text, { depth: "brief", maxChars: 320 });
        return buildLogicResponse({
          title: displayName,
          directAnswer: voice,
          summary: voice,
          cards: {
            snapshot: voice,
            catalyst: items[0]?.headline || "Headline and flow channel",
            macroContext: "Rates and risk appetite frame the move",
            sectorImpact: "Sector beta and peer sympathy in play",
            volatility: fq?.agreement
              ? "Cross-source quote agreement · vol active"
              : "Session volatility reflects headline sensitivity",
            aiSummary: text.slice(0, 520),
          },
          keyDrivers: ["News catalyst", "Sector sympathy", "Macro rates backdrop"],
          signals: ["Headline-driven", fq?.agreement ? "Sources aligned" : "Volatility active"],
          confidence: fq?.agreement ? 76 : 72,
          sources: fusionAttributionSources(fusion || { providers: ["finnhub"], failedSources }),
          mode: "ticker",
          usedAI: true,
        });
      }
    } catch (e) {
      failedSources.push(`aiWhyMoving:${e.message || "error"}`);
    }
  }

  const ai = await callLogicLLM(
    "You are Brieftick Logic — institutional ticker intelligence. Explain news and price context. No recommendations.",
    `Symbol: ${symbol} (${displayName})\nQuery type: ${isNewsQuery ? "news focus" : "price context"}\nPrompt: ${prompt}\n${buildFusionPromptExtras(ctx, symbol)}`,
    750
  );

  if (ai) {
    return {
      ...ai,
      mode: "ticker",
      mockData: !fusion?.live,
      sources: fusion
        ? fusionAttributionSources(fusion)
        : ai.sources,
    };
  }

  if (!quote && !items.length) {
    return buildFallbackResponse(ctx);
  }

  const pctStr = quote
    ? `${quote.pctChange >= 0 ? "+" : ""}${quote.pctChange.toFixed(2)}%`
    : null;

  let summaryText = `${displayName} is in focus`;
  if (quote) {
    const dir = quote.pctChange >= 0 ? "firmer" : "softer";
    summaryText = `${displayName} is ${dir} on the session (${pctStr}). Moves reflect catalyst sensitivity plus sector beta and macro risk channels.`;
  } else {
    summaryText = `${displayName} is seeing attention; live quote delayed. Context uses headline tone, sector patterns, and historical catalyst behavior.`;
  }

  return withDataLimited(
    {
      title: isNewsQuery
        ? `${displayName} · Latest news context`
        : `${displayName} (${symbol}) · Tape read`,
      summary: summaryText,
      cards: {
        snapshot: quote
          ? `${symbol} ${pctStr} — ${isNewsQuery ? "news-led" : "active session"}`
          : `${displayName} in focus; live quote delayed`,
        catalyst: items[0]?.headline || newsCtx.split(";")[0] || "Sector and headline narrative",
        macroContext: "Rates, dollar, and risk appetite set the backdrop for mega-cap beta",
        sectorImpact: "Peer sympathy in the same sector theme likely amplifies moves",
        volatility: quote
          ? Math.abs(quote.pctChange) > 2
            ? "Elevated single-name volatility"
            : "Moderate session volatility"
          : "Volatility inferred from sector regime",
        aiSummary: isNewsQuery
          ? `Narrative on ${displayName}: ${newsCtx.slice(0, 280)}`
          : `${displayName} is read through headlines and sector tone rather than price alone.`,
      },
      keyDrivers: [
        items[0]?.headline || "Headline / sector narrative",
        quote ? `Session ${pctStr}` : "Quote delayed",
        "Macro rates channel",
      ],
      signals: [
        quote?.pctChange >= 0 ? "Positive momentum" : "Negative momentum",
        fq?.agreement ? "Multi-source aligned" : isNewsQuery ? "News-sensitive" : "Flow-driven",
      ],
      confidence: quote && fusion?.live ? 74 : 52,
      sources: fusion
        ? fusionAttributionSources(fusion)
        : ["Brieftick Logic · contextual"],
      mode: "ticker",
      mockData: !quote || !fusion?.live,
      optionalCards: {
        relatedMovers: ctx.memory?.watchlist?.length
          ? `Watchlist context: ${ctx.memory.watchlist.slice(0, 5).join(", ")}`
          : undefined,
      },
    },
    failedSources
  );
}
