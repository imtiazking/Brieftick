/**
 * Ticker parsing & episode building for Relationship Story preview.
 * @module design-lab/portfolio-relationship-story/relationship-tickers
 */

import { resolveCompanyInput } from "/lib/company-name-resolver.js";
import { buildCustomRelationshipMeta } from "/design-lab/move-together/story/custom-relationship-meta.js";

export const MAX_STORY_TICKERS = 8;
export const MAX_RELATIVES_DISPLAY = 5;

const TICKER_RE = /^[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?$/;

/**
 * @typedef {Object} InputToken
 * @property {string} raw
 * @property {number} [weight]
 *
 * @typedef {Object} ParsedTickerGroup
 * @property {string[]} symbols
 * @property {Record<string, number>} weights
 * @property {Record<string, string>} symbolNames
 * @property {boolean} truncated
 * @property {'ok' | 'empty' | 'invalid' | 'ambiguous' | 'resolving'} status
 * @property {string} [message]
 * @property {AmbiguousPick[]} [pending]
 * @property {Partial<ParsedTickerGroup>} [partial]
 *
 * @typedef {Object} AmbiguousPick
 * @property {string} token
 * @property {{ symbol: string, name: string, exchange?: string }[]} matches
 * @property {number} [selectedIndex]
 *
 * @typedef {Object} RelationshipEpisode
 * @property {string} id
 * @property {string} hero
 * @property {string[]} relatives
 * @property {{ x: number, y: number }[]} positions
 * @property {'preset' | 'custom'} source
 * @property {string} [pickerLabel]
 * @property {ParsedTickerGroup} [group]
 * @property {Record<string, string>} [symbolNames]
 */

/**
 * @param {string} sym
 */
export function isValidTickerSymbol(sym) {
  return TICKER_RE.test(sym);
}

/**
 * @param {string} raw
 * @returns {InputToken[]}
 */
export function tokenizeRelationshipInput(raw) {
  /** @type {InputToken[]} */
  const tokens = [];
  const text = String(raw || "").trim();
  if (!text) return tokens;

  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const chunks = lines.length > 1 ? lines : [text];

  for (const chunk of chunks) {
    const portfolioMatch = chunk.match(/^(.+?)\s+([\d.,]+)\s*%?\s*$/);
    if (portfolioMatch && /[\d]/.test(portfolioMatch[2])) {
      tokens.push({
        raw: portfolioMatch[1].trim(),
        weight: parseFloat(portfolioMatch[2].replace(/,/g, "")),
      });
      continue;
    }

    if (chunk.includes(",")) {
      for (const part of chunk.split(",")) {
        const t = part.trim();
        if (t) tokens.push({ raw: t });
      }
      continue;
    }

    const words = chunk.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((w) => w.length <= 12)) {
      const allTickers = words.every((w) => isValidTickerSymbol(w.toUpperCase()));
      const allShort = words.every((w) => w.length <= 10);
      if (allTickers || (allShort && words.length <= 6)) {
        for (const w of words) tokens.push({ raw: w });
        continue;
      }
    }

    tokens.push({ raw: chunk.trim() });
  }

  return tokens;
}

/**
 * Legacy sync parse — tickers only (symbols).
 * @param {string} raw
 * @returns {ParsedTickerGroup}
 */
export function parseTickerInput(raw) {
  const weights = /** @type {Record<string, number>} */ ({});
  const symbolNames = /** @type {Record<string, string>} */ ({});
  const ordered = [];
  const seen = new Set();

  for (const token of tokenizeRelationshipInput(raw)) {
    const sym = token.raw.replace(/[^A-Za-z.]/g, "").toUpperCase();
    if (!isValidTickerSymbol(sym) || seen.has(sym)) continue;
    seen.add(sym);
    ordered.push(sym);
    if (token.weight != null && !Number.isNaN(token.weight)) {
      weights[sym] = token.weight;
    }
    symbolNames[sym] = token.raw;
  }

  if (!ordered.length) {
    return { symbols: [], weights, symbolNames, truncated: false, status: "empty" };
  }

  if (ordered.length < 2) {
    return {
      symbols: ordered,
      weights,
      symbolNames,
      truncated: false,
      status: "invalid",
      message: "Add at least two valid tickers or company names.",
    };
  }

  let truncated = false;
  let symbols = ordered;
  if (ordered.length > MAX_STORY_TICKERS) {
    truncated = true;
    symbols = ordered.slice(0, MAX_STORY_TICKERS);
  }

  return {
    symbols,
    weights,
    symbolNames,
    truncated,
    status: "ok",
    message: truncated ? "Showing first 8 tickers for clarity." : undefined,
  };
}

/**
 * @param {InputToken} token
 * @param {{ symbol: string, name: string }} choice
 */
export function applyResolutionChoice(token, choice) {
  return {
    token: token.raw,
    symbol: choice.symbol.toUpperCase(),
    name: choice.name || choice.symbol,
    weight: token.weight,
  };
}

/**
 * Resolve names/tickers via company resolver.
 * @param {string} raw
 * @param {{ choices?: Record<string, { symbol: string, name: string }> }} [opts]
 * @returns {Promise<ParsedTickerGroup>}
 */
export async function resolveTickerGroup(raw, opts = {}) {
  const tokens = tokenizeRelationshipInput(raw);
  const choices = opts.choices || {};

  if (!tokens.length) {
    return {
      symbols: [],
      weights: {},
      symbolNames: {},
      truncated: false,
      status: "empty",
    };
  }

  const symbols = [];
  const weights = /** @type {Record<string, number>} */ ({});
  const symbolNames = /** @type {Record<string, string>} */ ({});
  /** @type {AmbiguousPick[]} */
  const pending = [];

  for (const token of tokens) {
    const choiceKey = normalizeChoiceKey(token.raw);
    if (choices[choiceKey]) {
      const c = choices[choiceKey];
      pushResolved(c.symbol, c.name, token.weight);
      continue;
    }

    const result = await resolveCompanyInput(token.raw);

    if (result.status === "resolved") {
      pushResolved(result.symbol, result.name, token.weight);
      continue;
    }

    if (result.status === "ambiguous") {
      pending.push({
        token: token.raw,
        matches: result.matches,
        selectedIndex: 0,
      });
      continue;
    }

    return {
      symbols,
      weights,
      symbolNames,
      truncated: false,
      status: "invalid",
      message: result.message || `Couldn't resolve "${token.raw}".`,
      pending: pending.length ? pending : undefined,
      partial: { symbols, weights, symbolNames },
    };
  }

  if (pending.length) {
    return {
      symbols,
      weights,
      symbolNames,
      truncated: false,
      status: "ambiguous",
      pending,
      partial: { symbols, weights, symbolNames },
    };
  }

  if (symbols.length < 2) {
    return {
      symbols,
      weights,
      symbolNames,
      truncated: false,
      status: "invalid",
      message: "Add at least two valid tickers or company names.",
    };
  }

  let truncated = false;
  let finalSymbols = symbols;
  if (symbols.length > MAX_STORY_TICKERS) {
    truncated = true;
    finalSymbols = symbols.slice(0, MAX_STORY_TICKERS);
  }

  return {
    symbols: finalSymbols,
    weights,
    symbolNames,
    truncated,
    status: "ok",
    message: truncated ? "Showing first 8 tickers for clarity." : undefined,
  };

  function pushResolved(symRaw, name, weight) {
    const sym = String(symRaw).toUpperCase();
    if (!isValidTickerSymbol(sym) || symbols.includes(sym)) return;
    symbols.push(sym);
    symbolNames[sym] = name || sym;
    if (weight != null && !Number.isNaN(weight)) weights[sym] = weight;
  }
}

/**
 * @param {string} raw
 */
function normalizeChoiceKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {number} count
 */
export function layoutRelativePositions(count) {
  const layouts = {
    1: [{ x: 74, y: 48 }],
    2: [
      { x: 74, y: 32 },
      { x: 76, y: 64 },
    ],
    3: [
      { x: 72, y: 28 },
      { x: 78, y: 52 },
      { x: 68, y: 72 },
    ],
    4: [
      { x: 74, y: 24 },
      { x: 80, y: 42 },
      { x: 76, y: 58 },
      { x: 66, y: 76 },
    ],
    5: [
      { x: 74, y: 22 },
      { x: 82, y: 38 },
      { x: 78, y: 54 },
      { x: 70, y: 68 },
      { x: 62, y: 80 },
    ],
  };
  const n = Math.max(1, Math.min(count, MAX_RELATIVES_DISPLAY));
  return layouts[n] || layouts[3];
}

/**
 * @param {ParsedTickerGroup} parsed
 * @returns {RelationshipEpisode | null}
 */
export function buildCustomEpisode(parsed) {
  if (parsed.status !== "ok" || parsed.symbols.length < 2) return null;

  const hero = parsed.symbols[0];
  const relatives = parsed.symbols.slice(1, 1 + MAX_RELATIVES_DISPLAY);

  const relationshipMeta = buildCustomRelationshipMeta(
    hero,
    relatives,
    parsed.symbolNames
  );

  return {
    id: `custom-${hero}-${Date.now()}`,
    hero,
    relatives,
    positions: layoutRelativePositions(relatives.length),
    source: "custom",
    pickerLabel: hero,
    symbolNames: parsed.symbolNames,
    relationshipMeta,
    group: parsed,
  };
}
