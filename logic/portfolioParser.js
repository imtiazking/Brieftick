/**
 * Portfolio parser — paste box and normalized holdings extraction.
 * @module logic/portfolioParser
 */

import { buildPortfolioProfile } from "./portfolioProfile.js";
import { logicDebug } from "./shared.js";

const LINE_RE =
  /^\s*([A-Za-z]{1,5}|CASH)\s*[,:\t]?\s*([\d.]+)\s*%?\s*$/i;
const INLINE_RE =
  /([A-Za-z]{1,5}|CASH)\s+([\d.]+)\s*%/gi;

/**
 * @typedef {import('./portfolioProfile.js').ParsedHolding} ParsedHolding
 */

/**
 * @param {string} text
 * @returns {ParsedHolding[]}
 */
export function parsePortfolioPaste(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  /** @type {ParsedHolding[]} */
  const holdings = [];
  const seen = new Set();

  const add = (symbol, weight) => {
    const sym = String(symbol || "").toUpperCase();
    if (!sym || weight == null || Number.isNaN(weight)) return;
    if (sym === "CASH" || /^[A-Z]{1,5}$/.test(sym)) {
      if (seen.has(sym)) return;
      seen.add(sym);
      holdings.push({ symbol: sym, weight: Math.round(weight * 100) / 100 });
    }
  };

  for (const line of raw.split(/\n+/)) {
    const m = line.trim().match(LINE_RE);
    if (m) add(m[1], parseFloat(m[2]));
  }

  if (!holdings.length) {
    let match;
    while ((match = INLINE_RE.exec(raw)) !== null) {
      add(match[1], parseFloat(match[2]));
    }
  }

  if (!holdings.length) {
    for (const line of raw.split(/\n+/)) {
      const parts = line.trim().split(/[\s,\t]+/);
      if (parts.length >= 2) add(parts[0], parseFloat(parts[1]));
    }
  }

  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total > 0 && Math.abs(total - 100) > 2) {
    const scale = 100 / total;
    for (const h of holdings) h.weight = Math.round(h.weight * scale * 10) / 10;
  }

  logicDebug("portfolioParser", { count: holdings.length });
  return holdings;
}

/**
 * @param {ParsedHolding[]} holdings
 */
export function parsePortfolioToProfile(holdings) {
  return buildPortfolioProfile(holdings);
}

/**
 * Persist holdings to localStorage (shared with dashboard portfolio tab).
 * @param {ParsedHolding[]} holdings
 */
export function savePortfolioHoldings(holdings) {
  const payload = {
    holdings,
    profile: buildPortfolioProfile(holdings),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem("brieftick_portfolio_v1", JSON.stringify(payload));
    const ta = typeof document !== "undefined" ? document.getElementById("portfolioInput") : null;
    if (ta) {
      ta.value = holdings.map((h) => `${h.symbol} ${h.weight}`).join("\n");
    }
  } catch (_) {}
  return payload;
}

/**
 * @returns {{ holdings: ParsedHolding[], profile?: import('./portfolioProfile.js').PortfolioProfile } | null}
 */
export function loadSavedPortfolio() {
  try {
    const raw = localStorage.getItem("brieftick_portfolio_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { holdings: parsed, profile: buildPortfolioProfile(parsed) };
    }
    if (parsed?.holdings) {
      return {
        holdings: parsed.holdings,
        profile: parsed.profile || buildPortfolioProfile(parsed.holdings),
      };
    }
  } catch (_) {}
  return null;
}
