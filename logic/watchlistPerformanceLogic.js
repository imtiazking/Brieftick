/**
 * Watchlist performance — rank saved symbols by session move.
 * @module logic/watchlistPerformanceLogic
 */

import { buildLogicResponse } from "./types.js";
import { getQuote, withDataLimited, logicDebug } from "./shared.js";
import { fusionAttributionSources } from "./dataFusion.js";
import { getLogicWatchlist } from "./watchlistStore.js";
import { isValidWatchlistTicker, resolveWatchlistSymbols } from "./engines/watchlistSymbols.js";
import { concise } from "./engines/topicContext.js";

/**
 * @param {object} ctx
 */
export async function runWatchlistPerformanceLogic(ctx) {
  const raw =
    ctx.userContext?.watchlistSymbols?.length > 0
      ? ctx.userContext.watchlistSymbols
      : getLogicWatchlist();
  const symbols = resolveWatchlistSymbols(raw);

  logicDebug("watchlistPerformance.resolved", symbols);

  const failedSources = [...(ctx.fusion?.failedSources || [])];
  const wantWorst = /worst|loser|underperform|bottom/i.test((ctx.prompt || "").toLowerCase());
  const wantBest = !wantWorst || /best|top|gainer|outperform/i.test((ctx.prompt || "").toLowerCase());

  if (!symbols.length) {
    return buildLogicResponse({
      title: "Watchlist Performance",
      directAnswer:
        "Add tickers to your Logic watchlist first — then ask which name is leading or lagging the group.",
      summary: "No valid watchlist symbols saved yet.",
      mode: "watchlist",
      modeLabel: ctx.responsePlan?.label || "Watchlist Performance",
      confidence: 48,
      cards: {
        snapshot: "Save symbols in the watchlist panel to enable relative performance ranking.",
        catalyst: "—",
        macroContext: "—",
        sectorImpact: "—",
        volatility: "—",
        aiSummary: "Personal watchlist required for this question type.",
      },
      keyDrivers: ["Empty watchlist"],
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
