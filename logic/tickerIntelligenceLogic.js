import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  getQuote,
  logicDebug,
  resolveSymbolForPrompt,
  withDataLimited,
  MOCK_HEADLINES,
} from "./shared.js";

/**
 * @param {{ prompt: string, primaryEntity: import('./entityResolver.js').ResolvedEntity }} ctx
 */
export async function runTickerIntelligenceLogic(ctx) {
  const { prompt, primaryEntity } = ctx;
  const symbol = resolveSymbolForPrompt(prompt, primaryEntity);
  const displayName = primaryEntity.companyName || symbol;
  const failedSources = [];
  const api = window.BriefTickAPI;
  const isNewsQuery = /news|headline|latest|update/i.test(prompt);

  logicDebug("ticker_symbol", { symbol, displayName, isNewsQuery });

  if (api?.aiWhyMoving && !isNewsQuery) {
    try {
      const text = await api.aiWhyMoving(symbol);
      if (text) {
        return buildLogicResponse({
          title: `${displayName} (${symbol}) · Intelligence`,
          summary: text.slice(0, 480),
          cards: {
            snapshot: text.slice(0, 200),
            catalyst: "Live narrative from price and headline channel",
            macroContext: "Rates and risk appetite frame the move",
            sectorImpact: "Sector beta and peer sympathy in play",
            volatility: "Session volatility reflects headline sensitivity",
            aiSummary: text.slice(0, 520),
          },
          keyDrivers: ["News catalyst", "Sector sympathy", "Macro rates backdrop"],
          signals: ["Headline-driven", "Volatility active"],
          confidence: 74,
          sources: ["Finnhub", "Brieftick Logic"],
          mode: "ticker",
          usedAI: true,
        });
      }
    } catch (e) {
      failedSources.push(`aiWhyMoving:${e.message || "error"}`);
    }
  }

  const [{ quote, failedSources: quoteFail }, newsPack] = await Promise.all([
    getQuote(symbol),
    getHeadlines(8),
  ]);
  failedSources.push(...quoteFail, ...(newsPack.failedSources || []));

  const headlines = newsPack.headlines.length ? newsPack.headlines : MOCK_HEADLINES;
  const symUpper = symbol.toUpperCase();
  const nameLower = (displayName || "").toLowerCase();
  const relatedNews = headlines.filter((n) => {
    const h = `${n.headline || ""} ${n.summary || ""}`.toUpperCase();
    return h.includes(symUpper) || (nameLower && h.includes(nameLower.toUpperCase()));
  });
  const newsCtx = (relatedNews.length ? relatedNews : headlines)
    .slice(0, 4)
    .map((n) => n.headline)
    .join("; ");

  const ai = await callLogicLLM(
    "You are Brieftick Logic — institutional ticker intelligence. Explain news and price context. No recommendations.",
    `Symbol: ${symbol} (${displayName})\nQuery type: ${isNewsQuery ? "news focus" : "price context"}\nPrompt: ${prompt}\nQuote: ${quote ? JSON.stringify({ price: quote.price, pct: quote.pctChange }) : "unavailable"}\nHeadlines: ${newsCtx}`,
    750
  );

  if (ai) {
    return { ...ai, mode: "ticker", mockData: !newsPack.live };
  }

  const pctStr = quote
    ? `${quote.pctChange >= 0 ? "+" : ""}${quote.pctChange.toFixed(2)}%`
    : null;

  let summaryText = `${displayName} is in focus`;
  if (quote) {
    const dir = quote.pctChange >= 0 ? "firmer" : "softer";
    const channel = isNewsQuery
      ? "Headline flow is the primary narrative channel."
      : "Moves reflect catalyst sensitivity plus sector beta.";
    summaryText = `${displayName} is ${dir} on the session (${pctStr}). ${channel} Historical patterns suggest similar setups often cluster around earnings, guidance, or macro repricing.`;
  } else {
    summaryText = `${displayName} is seeing attention; live quote delayed. Context uses headline tone and sector patterns.`;
  }

  return withDataLimited(
    {
      title: isNewsQuery
        ? `${displayName} · Latest news context`
        : `${displayName} (${symbol}) · Tape read`,
      summary: summaryText,
      cards: {
        snapshot: quote
          ? `${symbol} ${pctStr} — ${isNewsQuery ? "news-led attention" : "active two-way trade"}`
          : `${displayName} in focus; live quote delayed`,
        catalyst: relatedNews[0]?.headline || newsCtx.split(";")[0] || "Sector and headline narrative",
        macroContext: "Rates, dollar, and risk appetite set the backdrop for mega-cap tech beta",
        sectorImpact: "Semiconductor and AI peer group sympathy likely amplifies single-name moves",
        volatility: quote
          ? Math.abs(quote.pctChange) > 2
            ? "Elevated single-name volatility"
            : "Moderate session volatility"
          : "Volatility context inferred from sector",
        aiSummary: isNewsQuery
          ? `Latest narrative on ${displayName} ties to headline flow: ${newsCtx.slice(0, 280)}`
          : `${displayName} price action is being read through headlines and sector tone rather than isolated technicals.`,
      },
      keyDrivers: [
        relatedNews[0]?.headline || "Headline / sector narrative",
        quote ? `Session change ${pctStr}` : "Quote feed delayed",
        "Macro rates and risk channel",
      ],
      signals: [
        quote?.pctChange >= 0 ? "Positive momentum" : "Negative momentum",
        isNewsQuery ? "News-sensitive" : "Flow-driven",
      ],
      confidence: quote && newsPack.live ? 72 : 52,
      sources: newsPack.live
        ? ["Finnhub", "Brieftick Logic"]
        : ["Brieftick Logic · contextual"],
      mode: "ticker",
      mockData: !quote || !newsPack.live,
    },
    failedSources
  );
}
