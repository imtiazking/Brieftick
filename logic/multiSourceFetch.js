/**
 * Parallel multi-provider fetch — quotes, news, macro, earnings, vol.
 * @module logic/multiSourceFetch
 */

import {
  resolveSymbolForPrompt,
  getHeadlines,
  getQuote,
  getPortfolioHoldings,
  logicDebug,
} from "./shared.js";

const SECTOR_ETFS = [
  ["XLK", "Technology"],
  ["XLF", "Financials"],
  ["XLE", "Energy"],
  ["XLV", "Health Care"],
  ["XLP", "Consumer Staples"],
];

/**
 * @typedef {Object} RawQuoteAttempt
 * @property {string} provider
 * @property {number|null} price
 * @property {number|null} pctChange
 * @property {number} [fetchedAt]
 */

/**
 * @typedef {Object} RawSourceBundle
 * @property {Record<string, { attempts: RawQuoteAttempt[], symbol: string }>} quotes
 * @property {{ headlines: object[], live: boolean, delayed: boolean, failedSources: string[] }} news
 * @property {{ score: number, label: string, keywords: string[] }} sentiment
 * @property {{ vixLabel: string, regime: string }} volatility
 * @property {{ sym: string, label: string, pct: number|null }[]} sectorMoves
 * @property {{ holdings: { symbol: string, weight: number }[], topWeight: number }} portfolio
 * @property {string[]} failedSources
 * @property {string[]} providers
 * @property {object[]} relatedHeadlines
 */

async function fetchPolygonQuote(symbol) {
  if (typeof window === "undefined" || typeof getPolygonQuotes !== "function") return null;
  try {
    const batch = await getPolygonQuotes([symbol]);
    const q = batch?.[symbol];
    if (q?.price != null) {
      return {
        provider: "polygon",
        price: q.price,
        pctChange: q.pctChange,
        fetchedAt: Date.now(),
      };
    }
  } catch (e) {
    return { error: `polygon:${e.message || "error"}` };
  }
  return null;
}

function scoreSentiment(headlines) {
  const text = headlines
    .map((n) => `${n.headline || ""} ${n.summary || ""}`)
    .join(" ")
    .toLowerCase();
  const riskOff = (text.match(/recession|selloff|risk-off|downgrade|layoff|default/g) || []).length;
  const riskOn = (text.match(/rally|beat|upgrade|record|surge|expansion|cut rates/g) || []).length;
  const score = Math.max(-1, Math.min(1, (riskOn - riskOff) / 6));
  const label =
    score > 0.25 ? "Risk-on headline tone" : score < -0.25 ? "Risk-off headline tone" : "Mixed sentiment";
  return { score, label, keywords: [] };
}

async function readVolatilityContext() {
  let vixLabel = "Monitored";
  let regime = "Mixed";
  try {
    if (typeof liveRefreshVix === "function") await liveRefreshVix();
    const vixEl = document.getElementById("vixValue");
    const regimeEl = document.getElementById("riskRegimeLabel");
    if (regimeEl?.textContent) regime = regimeEl.textContent.trim();
    if (vixEl?.textContent) vixLabel = vixEl.textContent.trim();
  } catch (_) {}
  return { vixLabel, regime };
}

/**
 * @param {import('./sourceRouter.js').SourceRoute} sourceRoute
 * @param {{ prompt: string, mode: string, primaryEntity: import('./entityResolver.js').ResolvedEntity }} ctx
 * @returns {Promise<RawSourceBundle>}
 */
export async function multiSourceFetch(sourceRoute, ctx) {
  const failedSources = [];
  const providers = new Set(sourceRoute.providers || []);
  const quotes = /** @type {RawSourceBundle["quotes"]} */ ({});

  const sym = resolveSymbolForPrompt(ctx.prompt, ctx.primaryEntity);
  const symbols = new Set();
  if (sym) symbols.add(sym);
  if (ctx.mode === "market-pulse" || ctx.mode === "daily-brief") {
    symbols.add("SPY");
    symbols.add("QQQ");
  }
  if (ctx.mode === "portfolio") {
    getPortfolioHoldings()
      .slice(0, 6)
      .forEach((h) => h.symbol && symbols.add(h.symbol));
  }

  const intents = sourceRoute.intents || [];
  logicDebug("multiSourceFetch started", { intents, symbols: [...symbols] });

  const tasks = [];

  let newsPack = { headlines: [], live: false, delayed: false, failedSources: [] };
  if (
    intents.includes("news") ||
    intents.includes("macro") ||
    intents.includes("sentiment") ||
    intents.includes("earnings")
  ) {
    tasks.push(
      getHeadlines(12).then((pack) => {
        newsPack = pack;
        failedSources.push(...(pack.failedSources || []));
        if (pack.live) providers.add("finnhub");
      })
    );
  }

  let volatility = { vixLabel: "Monitored", regime: "Mixed" };
  if (intents.includes("volatility") || intents.includes("risk")) {
    tasks.push(
      readVolatilityContext().then((v) => {
        volatility = v;
        providers.add("macro");
      })
    );
  }

  let sectorMoves = [];
  if (intents.includes("sector") || ctx.mode === "sector-rotation") {
    tasks.push(
      (async () => {
        for (const [etfSym, label] of SECTOR_ETFS) {
          let pct = null;
          try {
            const { quote } = await getQuote(etfSym);
            pct = quote?.pctChange ?? null;
            if (quote) providers.add("finnhub");
          } catch (e) {
            failedSources.push(`sector:${etfSym}`);
          }
          sectorMoves.push({ sym: etfSym, label, pct });
        }
        sectorMoves.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
      })()
    );
  }

  await Promise.all(tasks);

  if (intents.includes("quote")) {
    await Promise.all(
      [...symbols].slice(0, 8).map(async (symbol) => {
        const attempts = [];
        const { quote: q1, failedSources: f1 } = await getQuote(symbol);
        failedSources.push(...f1);
        if (q1) {
          attempts.push({
            provider: "finnhub",
            price: q1.price,
            pctChange: q1.pctChange,
            fetchedAt: Date.now(),
          });
          providers.add("finnhub");
        }

        const api = window.BriefTickAPI;
        if (api?.keys?.twelvedata && typeof api.getQuotes === "function") {
          try {
            const batch = await api.getQuotes([symbol]);
            const q2 = batch?.[symbol];
            if (q2?.pctChange != null) {
              attempts.push({
                provider: "twelvedata",
                price: q2.price,
                pctChange: q2.pctChange,
                fetchedAt: Date.now(),
              });
              providers.add("twelvedata");
            }
          } catch (e) {
            failedSources.push(`twelvedata:${symbol}:${e.message || "error"}`);
          }
        }

        if (api?.keys?.polygon) {
          const poly = await fetchPolygonQuote(symbol);
          if (poly && !poly.error) {
            attempts.push(poly);
            providers.add("polygon");
          } else if (poly?.error) failedSources.push(poly.error);
        }

        if (attempts.length) quotes[symbol] = { symbol, attempts };
      })
    );
  }

  const symUpper = (sym || "").toUpperCase();
  const nameLower = (ctx.primaryEntity?.companyName || "").toLowerCase();
  const relatedHeadlines = (newsPack.headlines || []).filter((n) => {
    const h = `${n.headline || ""} ${n.summary || ""}`.toUpperCase();
    if (!symUpper && !nameLower) return true;
    return h.includes(symUpper) || (nameLower && h.includes(nameLower.toUpperCase()));
  });

  const holdings = getPortfolioHoldings();
  const topWeight = holdings.reduce((max, h) => Math.max(max, h.weight || 0), 0);

  const raw = {
    quotes,
    news: newsPack,
    sentiment: scoreSentiment(relatedHeadlines.length ? relatedHeadlines : newsPack.headlines),
    volatility,
    sectorMoves,
    portfolio: { holdings, topWeight },
    failedSources,
    providers: [...providers],
    relatedHeadlines,
  };

  logicDebug("multiSourceFetch complete", {
    quoteSymbols: Object.keys(quotes),
    news: newsPack.headlines?.length || 0,
    sentiment: raw.sentiment.label,
  });

  return raw;
}
