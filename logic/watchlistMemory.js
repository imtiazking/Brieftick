/**
 * User-aware Logic memory — watchlist, themes, recent interactions.
 * @module logic/watchlistMemory
 */

import { getWatchlist, getPortfolioHoldings } from "./shared.js";
import { resolvePortfolioContext } from "./engines/inferredPortfolioContext.js";

const MEMORY_KEY = "brieftick_logic_memory_v1";
const MAX_INTERACTIONS = 24;

/**
 * @typedef {Object} LogicMemory
 * @property {string[]} watchlist
 * @property {string[]} sectors
 * @property {string[]} themes
 * @property {{ prompt: string, mode: string, symbol: string|null, at: string }[]} interactions
 */

function userMemoryKey() {
  const uid =
    window._clerkUser?.id || window.Clerk?.user?.id || "anonymous";
  return `${MEMORY_KEY}_${uid}`;
}

/**
 * @returns {LogicMemory}
 */
export function loadLogicMemory() {
  const base = {
    watchlist: getWatchlist(),
    sectors: [],
    themes: [],
    interactions: [],
  };
  try {
    const raw = localStorage.getItem(userMemoryKey());
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      watchlist: [...new Set([...base.watchlist, ...(parsed.watchlist || [])])].slice(
        0,
        16
      ),
      sectors: parsed.sectors || [],
      themes: parsed.themes || [],
      interactions: parsed.interactions || [],
    };
  } catch (_) {
    return base;
  }
}

/**
 * @param {string} prompt
 * @param {string} mode
 * @param {import('./entityResolver.js').ResolvedEntity} [entity]
 */
export function recordLogicInteraction(prompt, mode, entity) {
  const mem = loadLogicMemory();
  const symbol = entity?.symbol || null;
  mem.interactions.unshift({
    prompt: (prompt || "").slice(0, 200),
    mode,
    symbol,
    at: new Date().toISOString(),
  });
  mem.interactions = mem.interactions.slice(0, MAX_INTERACTIONS);

  if (entity?.entityType === "sector_theme" && entity.companyName) {
    if (!mem.sectors.includes(entity.companyName)) mem.sectors.push(entity.companyName);
    mem.sectors = mem.sectors.slice(0, 8);
  }
  if (/ai|semiconductor|energy|financial/i.test(prompt)) {
    const theme = /ai/i.test(prompt)
      ? "AI infrastructure"
      : /semi/i.test(prompt)
        ? "Semiconductors"
        : /energy/i.test(prompt)
          ? "Energy"
          : "Financials";
    if (!mem.themes.includes(theme)) mem.themes.push(theme);
    mem.themes = mem.themes.slice(0, 6);
  }

  try {
    localStorage.setItem(userMemoryKey(), JSON.stringify(mem));
  } catch (_) {}
}

/**
 * @param {import('./entityResolver.js').ResolvedEntity} entity
 * @param {import('./types.js').LogicMode} mode
 */
export function buildMemoryContext(entity, mode) {
  const mem = loadLogicMemory();
  const holdings = getPortfolioHoldings().map((h) => h.symbol).filter(Boolean);
  const watch = mem.watchlist.length ? mem.watchlist : holdings.slice(0, 6);
  const sym = entity?.symbol;
  const lines = [];

  if (sym && watch.includes(sym)) {
    lines.push(`${sym} is on your saved watchlist.`);
  } else if (sym && watch.some((w) => w && sym !== w)) {
    const overlap = watch.filter((w) => w).slice(0, 3).join(", ");
    lines.push(
      `${entity.companyName || sym} may correlate with watchlist names: ${overlap}.`
    );
  }

  if (mem.themes.length) {
    lines.push(`Themes you follow: ${mem.themes.slice(0, 3).join(", ")}.`);
  }

  const recent = mem.interactions.find((i) => i.mode === mode && i.symbol === sym);
  if (recent) {
    lines.push(`Recent Logic on this name: "${recent.prompt.slice(0, 80)}…"`);
  }

  if (mode === "portfolio") {
    const book = resolvePortfolioContext();
    if (book.source === "explicit") {
      lines.push(`Portfolio context: ${book.holdings.length} saved positions with weights.`);
    } else if (book.source === "inferred_watchlist") {
      lines.push("Watchlist-derived portfolio interpretation active.");
    }
  }

  return {
    hint: lines.join(" "),
    watchlist: watch,
    themes: mem.themes,
    holdings,
  };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {{ hint: string }} memory
 */
export function applyMemoryToResponse(res, memory) {
  if (!memory?.hint) return res;
  const cards = { ...res.cards };
  const optional = { ...(res.optionalCards || {}) };

  if (memory.hint.includes("watchlist")) {
    optional.portfolioImpact = memory.hint.slice(0, 220);
  } else if (memory.themes?.length) {
    optional.relatedMovers = `Watchlist / theme lens: ${memory.hint.slice(0, 200)}`;
  }

  if (cards.snapshot && !cards.snapshot.includes("watchlist")) {
    cards.snapshot = `${cards.snapshot} ${memory.hint}`.trim().slice(0, 280);
  }

  return { ...res, cards, optionalCards: optional, memoryHint: memory.hint };
}
