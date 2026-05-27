import { buildLogicResponse } from "./types.js";
import {
  callLogicLLM,
  getHeadlines,
  getQuote,
  logicDebug,
  resolveSymbolForPrompt,
  resolveSymbolsForPrompt,
  withDataLimited,
  MOCK_HEADLINES,
  buildFusionPromptExtras,
} from "./shared.js";
import { getFusedQuote, fusionAttributionSources } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";
import { humanizeLogicAnswer } from "./engines/conversationalVoice.js";
import { getTickerDisplayName } from "./engines/tickerCatalog.js";

const SYMBOL_HEADLINE_HINTS = {
  GLD: /gold|bullion|precious|safe.?haven/i,
  SLV: /silver|precious/i,
  GDX: /gold|miner/i,
  USO: /oil|crude|opec|wti|brent|energy/i,
  UNG: /natural gas|lng|gas price/i,
  UUP: /dollar|dxy|usd|currency|fx|greenback/i,
  USD: /dollar|dxy|usd|currency|fx|greenback/i,
  SPY: /s&p|sp500|equit|stock market|index/i,
  QQQ: /nasdaq|tech|growth stock/i,
};

/**
 * @param {{ prompt: string, primaryEntity: import('./entityResolver.js').ResolvedEntity, fusion?: import('./dataFusion.js').FusionBundle, memory?: object }} ctx
 */
/**
 * @param {object[]} headlines
 * @param {string} symbol
 */
function headlinesForSymbol(headlines, symbol) {
  const re = SYMBOL_HEADLINE_HINTS[symbol];
  if (!re || !headlines?.length) return headlines || [];
  const matched = headlines.filter((n) => re.test(n.headline || ""));
  return matched.length ? matched : headlines.slice(0, 3);
}

/**
 * @param {object} ctx
 * @param {string[]} symbols
 */
async function runMultiTickerIntelligence(ctx, symbols) {
  const { prompt, fusion } = ctx;
  const failedSources = [...(fusion?.failedSources || [])];
  const headlines =
    fusion?.relatedHeadlines?.length
      ? fusion.relatedHeadlines
      : fusion?.news?.headlines?.length
        ? fusion.news.headlines
        : (await getHeadlines(10)).headlines;

  /** @type {{ symbol: string, name: string, pct: number|null, headline: string }[]} */
  const rows = [];

  for (const sym of symbols.slice(0, 4)) {
    const fq = fusion ? getFusedQuote(fusion, sym) : null;
    let quote = fq ? { pctChange: fq.pctChange } : null;
    if (!quote) {
      const { quote: q, failedSources: qf } = await getQuote(sym);
      quote = q;
      failedSources.push(...qf);
    }
    const symHeadlines = headlinesForSymbol(headlines, sym);
    rows.push({
      symbol: sym,
      name: getTickerDisplayName(sym),
      pct: typeof quote?.pctChange === "number" ? quote.pctChange : null,
      headline: symHeadlines[0]?.headline || "",
    });
  }

  const parts = rows.map((r) => {
    const pct =
      r.pct == null ? "quote delayed" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`;
    return `${r.name} (${r.symbol}) ${pct}`;
  });

  let direct = humanizeLogicAnswer(
    `${parts.join(" · ")}. Read each name on its own catalyst channel — not broad equity index tape.`,
    { depth: "brief", maxChars: 340 }
  );

  const detail = rows
    .map((r) => {
      const pct =
        r.pct == null ? "session move unavailable" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`;
      const hook = r.headline ? r.headline.slice(0, 120) : "No dominant single headline — macro and cross-asset flows dominate.";
      return `${r.symbol} (${pct}): ${hook}`;
    })
    .join(" ");

  direct = humanizeLogicAnswer(detail, { depth: "standard", maxChars: 420 });

  return withDataLimited(
    buildLogicResponse({
      title: symbols.join(" · "),
      directAnswer: direct,
      summary: direct,
      cards: {
        snapshot: direct,
        catalyst: rows.map((r) => r.headline).filter(Boolean).slice(0, 2).join(" · ") || "Symbol-specific catalysts",
        macroContext: "Cross-asset read — gold, dollar, and oil do not always move with the S&P.",
        sectorImpact: parts.join(" · "),
        volatility: rows.some((r) => r.pct != null && Math.abs(r.pct) >= 1.5)
          ? "Elevated move in at least one leg"
          : "Contained session moves",
        aiSummary: direct,
      },
      keyDrivers: rows.map((r) => `${r.symbol} session`),
      signals: rows.map((r) =>
        r.pct == null ? `${r.symbol}: delayed` : `${r.symbol}: ${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`
      ),
      confidence: rows.some((r) => r.pct != null) ? 72 : 50,
      sources: fusion ? fusionAttributionSources(fusion) : ["Live quotes", "Brieftick Logic"],
      mode: "ticker",
      primarySymbol: symbols[0],
    }),
    failedSources
  );
}

export async function runTickerIntelligenceLogic(ctx) {
  const { prompt, primaryEntity, fusion } = ctx;
  const opts = ctx.entityOpts || { watchlistSymbols: ctx.userContext?.watchlistSymbols };
  let symbols =
    ctx.tickerTargets?.length > 0
      ? ctx.tickerTargets
      : resolveSymbolsForPrompt(prompt, primaryEntity, opts);

  if (!symbols.length) {
    const one = resolveSymbolForPrompt(prompt, primaryEntity, opts);
    if (one) symbols = [one];
  }

  if (!symbols.length) {
    return buildFallbackResponse(ctx);
  }

  if (symbols.length > 1) {
    return runMultiTickerIntelligence(ctx, symbols);
  }

  const symbol = symbols[0];
  const displayName = getTickerDisplayName(symbol) || primaryEntity.companyName || symbol;
  const failedSources = [...(fusion?.failedSources || [])];
  const api = window.BriefTickAPI;
  const isNewsQuery = /news|headline|latest|update/i.test(prompt);

  logicDebug("ticker_symbol", { symbol, displayName, isNewsQuery, symbols });

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

  const items = headlinesForSymbol(headlines.length ? headlines : MOCK_HEADLINES, symbol);
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
    "You are Brieftick Logic — institutional ticker intelligence. Plain prose only; answer ONLY for the symbol named. Do not discuss SPY unless the symbol is SPY. No recommendations.",
    `Symbol: ${symbol} (${displayName}) — answer for this symbol only.\nQuery type: ${isNewsQuery ? "news focus" : "price context"}\nPrompt: ${prompt}\n${buildFusionPromptExtras(ctx, symbol)}`,
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
        macroContext:
          symbol === "GLD" || symbol === "SLV"
            ? "Real yields and geopolitical risk premia anchor gold"
            : symbol === "USO" || symbol === "UNG"
              ? "Crude supply and geopolitical risk drive the energy complex"
              : symbol === "USD" || symbol === "UUP"
                ? "Rate differentials and risk appetite drive the dollar"
                : "Macro cross-currents frame the move",
        sectorImpact:
          symbol === "GLD" || symbol === "SLV"
            ? "Precious metals and miners set the peer context"
            : "Related ETF and futures sympathy",
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
