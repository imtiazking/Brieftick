/**
 * Company name → ticker resolver (cache → local lookup → search API).
 * @module lib/company-name-resolver
 */

import { lookupMoversSymbol } from "/lib/moversSymbolLookup.js";

const CACHE_KEY = "brieftick_symbol_resolution_cache";
const CACHE_MAX_ENTRIES = 200;
const TICKER_RE = /^[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?$/;

/**
 * @typedef {Object} SymbolMatch
 * @property {string} symbol
 * @property {string} name
 * @property {string} [exchange]
 * @property {number} [score]
 *
 * @typedef {Object} ResolvedSymbol
 * @property {'resolved'} status
 * @property {string} symbol
 * @property {string} name
 * @property {string} source
 *
 * @typedef {Object} AmbiguousSymbol
 * @property {'ambiguous'} status
 * @property {string} query
 * @property {SymbolMatch[]} matches
 *
 * @typedef {Object} UnresolvedSymbol
 * @property {'unresolved'} status
 * @property {string} query
 * @property {string} [message]
 */

/**
 * @param {string} s
 */
export function normalizeLookupKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} sym
 */
export function isLikelyTickerSymbol(sym) {
  return TICKER_RE.test(String(sym || "").toUpperCase());
}

/**
 * @returns {Record<string, { symbol: string, name: string, t: number }>}
 */
export function readResolutionCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} inputKey
 * @param {{ symbol: string, name: string }} entry
 */
export function cacheResolution(inputKey, entry) {
  const key = normalizeLookupKey(inputKey);
  if (!key || !entry?.symbol) return;
  const cache = readResolutionCache();
  cache[key] = {
    symbol: entry.symbol.toUpperCase(),
    name: entry.name || entry.symbol,
    t: Date.now(),
  };
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX_ENTRIES) {
    keys
      .sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0))
      .slice(0, keys.length - CACHE_MAX_ENTRIES)
      .forEach((k) => delete cache[k]);
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} inputKey
 * @returns {{ symbol: string, name: string } | null}
 */
export function getCachedResolution(inputKey) {
  const hit = readResolutionCache()[normalizeLookupKey(inputKey)];
  if (!hit?.symbol) return null;
  return { symbol: hit.symbol, name: hit.name };
}

/**
 * @param {string} query
 * @param {SymbolMatch[]} matches
 */
export function rankSymbolMatches(query, matches) {
  const q = normalizeLookupKey(query);
  return [...matches]
    .map((m) => {
      let score = m.score ?? 0;
      const sym = m.symbol.toUpperCase();
      const nameNorm = normalizeLookupKey(m.name);
      if (sym === q.replace(/[^a-z0-9.]/g, "").toUpperCase()) score += 85;
      if (nameNorm === q) score += 70;
      if (nameNorm.startsWith(q) || q.startsWith(nameNorm.split(" ")[0])) score += 35;
      if (/\./.test(sym) && !/\.(B|A)$/.test(sym)) score -= 25;
      const ex = String(m.exchange || "").toUpperCase();
      if (ex.includes("NASDAQ") || ex.includes("NYSE") || ex === "NMS" || ex === "NYQ" || ex === "US") {
        score += 18;
      }
      return { ...m, symbol: sym, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * @param {SymbolMatch[]} ranked
 */
function pickAutoMatch(ranked) {
  if (!ranked.length) return null;
  if (ranked.length === 1) return ranked[0];
  const top = ranked[0];
  const second = ranked[1];
  if (top.score >= 75 && top.score - (second?.score ?? 0) >= 12) return top;
  if (top.score >= 88) return top;
  return null;
}

/**
 * @param {string} query
 */
async function searchFinnhub(query) {
  const url = `/api/proxy?provider=finnhub&endpoint=search&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data?.result)) return null;
  return data.result
    .filter((row) => {
      const t = String(row.type || "").toLowerCase();
      return !t || t.includes("stock") || t === "eqs" || t === "common stock";
    })
    .map((row) => ({
      symbol: String(row.symbol || row.displaySymbol || "")
        .toUpperCase()
        .replace(/\.(US|NASDAQ|NYSE)$/i, ""),
      name: row.description || row.symbol,
      exchange: row.displaySymbol || row.type || "",
    }))
    .filter((row) => isLikelyTickerSymbol(row.symbol));
}

/**
 * @param {string} query
 */
async function searchYahoo(query) {
  const url = `/api/proxy?provider=yahoo&endpoint=search&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data?.matches)) return null;
  return data.matches
    .map((row) => ({
      symbol: String(row.symbol || "").toUpperCase(),
      name: row.name || row.symbol,
      exchange: row.exchange || "",
    }))
    .filter((row) => isLikelyTickerSymbol(row.symbol));
}

/**
 * @param {string} query
 * @returns {Promise<SymbolMatch[]>}
 */
export async function searchSymbolCandidates(query) {
  const finnhub = await searchFinnhub(query);
  if (finnhub?.length) return rankSymbolMatches(query, finnhub);
  const yahoo = await searchYahoo(query);
  if (yahoo?.length) return rankSymbolMatches(query, yahoo);
  return [];
}

/**
 * @param {string} rawInput
 * @returns {Promise<ResolvedSymbol | AmbiguousSymbol | UnresolvedSymbol>}
 */
export async function resolveCompanyInput(rawInput) {
  const query = String(rawInput || "").trim();
  if (!query) {
    return { status: "unresolved", query, message: "Empty input." };
  }

  const cached = getCachedResolution(query);
  if (cached) {
    return { status: "resolved", symbol: cached.symbol, name: cached.name, source: "cache" };
  }

  const local = lookupMoversSymbol(query);
  if (local.ok && local.symbol && (local.confidence ?? 0) >= 78) {
    const entry = { symbol: local.symbol, name: local.name || local.symbol };
    cacheResolution(query, entry);
    return { status: "resolved", ...entry, source: local.source || "local" };
  }

  if (isLikelyTickerSymbol(query.toUpperCase())) {
    const sym = query.toUpperCase();
    const byTicker = lookupMoversSymbol(sym);
    const name = byTicker.ok ? byTicker.name || sym : sym;
    const entry = { symbol: sym, name };
    cacheResolution(query, entry);
    cacheResolution(sym, entry);
    return { status: "resolved", ...entry, source: "ticker" };
  }

  const ranked = await searchSymbolCandidates(query);
  const auto = pickAutoMatch(ranked);
  if (auto) {
    const entry = { symbol: auto.symbol, name: auto.name };
    cacheResolution(query, entry);
    return { status: "resolved", ...entry, source: "search" };
  }

  if (ranked.length > 0) {
    return { status: "ambiguous", query, matches: ranked.slice(0, 6) };
  }

  if (local.ok && local.symbol) {
    const entry = { symbol: local.symbol, name: local.name || local.symbol };
    cacheResolution(query, entry);
    return { status: "resolved", ...entry, source: local.source || "local-suggest" };
  }

  if (local.suggestions?.length) {
    return {
      status: "ambiguous",
      query,
      matches: local.suggestions.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        exchange: "US",
      })),
    };
  }

  return {
    status: "unresolved",
    query,
    message: `Couldn't find a match for "${query}".`,
  };
}
