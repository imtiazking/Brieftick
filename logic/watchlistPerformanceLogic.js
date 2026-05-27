/**
 * Watchlist performance — rank saved symbols by session move.
 * @module logic/watchlistPerformanceLogic
 */

import { buildLogicResponse } from "./types.js";
import { getQuote, withDataLimited, logicDebug } from "./shared.js";
import { fusionAttributionSources } from "./dataFusion.js";
import {
  isValidWatchlistTicker,
  resolveWatchlistForQuery,
} from "./engines/watchlistSymbols.js";
import { saveLogicWatchlist } from "./watchlistStore.js";
import { concise } from "./engines/topicContext.js";

/**
 * @param {object} ctx
 */
export async function runWatchlistPerformanceLogic(ctx) {
  const prompt = ctx.prompt || "";
  const { symbols, source } = resolveWatchlistForQuery(
    prompt,
    ctx.userContext?.watchlistSymbols
  );

  if (source === "prompt" && symbols.length && typeof window !== "undefined") {
    window.watchlistSymbols = symbols;
    if (symbols.length >= 2) {
      try {
        saveLogicWatchlist(symbols);
      } catch (_) {}
    }
  }

  logicDebug("watchlistPerformance.resolved", { symbols, source });

  const failedSources = [...(ctx.fusion?.failedSources || [])];
  const wantWorst = /worst|loser|underperform|bottom/i.test((ctx.prompt || "").toLowerCase());
  const wantBest = !wantWorst || /best|top|gainer|outperform/i.test((ctx.prompt || "").toLowerCase());

  if (!symbols.length) {
    return buildLogicResponse({
      title: "Watchlist Performance",
      directAnswer:
        "Save tickers in Portfolio & watchlist (click Add), or name them in your question — e.g. “NVDA and MSFT — which is leading today?”",
      summary: "No symbols to rank yet.",
      mode: "watchlist",
      modeLabel: ctx.responsePlan?.label || "Watchlist Performance",
      confidence: 48,
      cards: {
        snapshot:
          "Use Portfolio & watchlist on the right, or include tickers in your question.",
        catalyst: "Save symbols before asking — placeholder chips are not your list.",
        macroContext: "—",
        sectorImpact: "—",
        volatility: "—",
        aiSummary: "Personal watchlist required — save tickers or name them in the prompt.",
      },
        keyDrivers: [
          "No watchlist symbols found — save tickers in Portfolio & watchlist, or name them in your question (e.g. NVDA, MSFT).",
        ],
      signals: ["Add symbols to personalize"],
      sources: ["Brieftick Logic"],
    });
  }

  /** @type {{ symbol: string, pct: number, price: number|null }[]} */
  const rows = [];
  for (const sym of symbols.slice(0, 16)) {
    if (!isValidWatchlistTicker(sym) || !symbols.includes(sym)) {
      logicDebug("watchlistPerformance.skip", { sym, reason: "invalid_or_not_in_list" });
      continue;
    }
    const { quote, failedSources: fs } = await getQuote(sym);
    failedSources.push(...fs);
    rows.push({
      symbol: sym,
      pct: typeof quote?.pctChange === "number" ? quote.pctChange : 0,
      price: quote?.price ?? null,
    });
  }

  const validRows = rows.filter((r) => isValidWatchlistTicker(r.symbol));
  if (!validRows.length) {
    return buildLogicResponse({
      title: "Watchlist Performance",
      directAnswer:
        "Could not rank your watchlist — saved tickers did not pass validation. Re-add symbols as separate tickers (e.g. NVDA, MSFT, AAPL).",
      summary: "Watchlist symbol validation failed.",
      mode: "watchlist",
      modeLabel: ctx.responsePlan?.label || "Watchlist Performance",
      confidence: 42,
      cards: {
        snapshot: `Expected valid symbols like ${symbols.slice(0, 4).join(", ")}.`,
        catalyst: "—",
        macroContext: "—",
        sectorImpact: "—",
        volatility: "—",
        aiSummary: "No safe ranking output — malformed symbols were excluded.",
      },
      keyDrivers: ["Invalid watchlist symbols"],
      signals: [],
      sources: ["Brieftick Logic"],
    });
  }

  const quoted = validRows.filter((r) => r.price != null);
  const rankPool = quoted.length ? quoted : validRows;
  rankPool.sort((a, b) => (wantWorst ? a.pct - b.pct : b.pct - a.pct));

  const leader = rankPool[0];
  const laggard = [...rankPool].sort((a, b) => a.pct - b.pct)[0];
  const focus = wantWorst && !wantBest ? laggard : leader;

  const ranking = validRows
    .slice(0, 8)
    .map((r, i) => `${i + 1}. ${r.symbol} ${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`)
    .join(" · ");

  const direct = concise(
    wantWorst && !wantBest
      ? `Weakest watchlist name today: ${focus.symbol} (${focus.pct >= 0 ? "+" : ""}${focus.pct.toFixed(2)}%). Full rank: ${ranking}.`
      : `Best watchlist performer today: ${focus.symbol} (${focus.pct >= 0 ? "+" : ""}${focus.pct.toFixed(2)}%). Full rank: ${ranking}.`
  );

  const summary = `${symbols.length} watchlist symbols ranked by session change. Leader ${leader.symbol}; laggard ${laggard.symbol}.`;

  return withDataLimited(
    buildLogicResponse({
      title: "Watchlist Performance",
      directAnswer: direct,
      summary,
      mode: "watchlist",
      modeLabel: ctx.responsePlan?.label || "Watchlist Performance",
      confidence: validRows.some((r) => r.price != null) ? 74 : 58,
      cards: {
        snapshot: direct,
        catalyst: `Dispersion: ${(leader.pct - laggard.pct).toFixed(2)} pts between leader and laggard.`,
        macroContext: "Relative strength inside your list — not a market-wide call.",
        sectorImpact: ranking,
        volatility: validRows.filter((r) => Math.abs(r.pct) >= 2).length
          ? `${validRows.filter((r) => Math.abs(r.pct) >= 2).length} names moving ≥2% — elevated single-name vol.`
          : "Moves are contained — no extreme single-name gaps in the list.",
        aiSummary: summary,
      },
      keyDrivers: [
        `${focus.symbol} ${wantWorst && !wantBest ? "lags" : "leads"} the watchlist`,
        `${symbols.length} symbols tracked`,
      ],
      signals: validRows
        .slice(0, 3)
        .map((r) => `${r.symbol}: ${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`),
      sources: ctx.fusion ? fusionAttributionSources(ctx.fusion) : ["Live quotes", "Brieftick Logic"],
      optionalCards: {
        relatedMovers: ranking,
      },
    }),
    failedSources
  );
}
