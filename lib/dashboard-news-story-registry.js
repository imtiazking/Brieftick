/**
 * Dashboard News story registry — intelligence categories (no editorial ordering).
 * Headlines and short titles are generated live in dashboard-news-story-engine.js.
 * @module lib/dashboard-news-story-registry
 */

/**
 * @typedef {Object} StoryRegistryEntry
 * @property {string} id
 * @property {string} why
 * @property {string[]} impactSectors
 * @property {string} globeStoryId
 * @property {string[]} quoteSymbols
 * @property {string[]} sectorEtfs
 * @property {string[]} newsKeywords
 */

/** @type {StoryRegistryEntry[]} */
export const STORY_REGISTRY = [
  {
    id: "inflation",
    why: "Higher rates can make growth stocks less attractive.",
    impactSectors: ["Technology", "Banks", "Energy"],
    globeStoryId: "inflation",
    quoteSymbols: ["XLF", "XLK", "SPY", "QQQ", "XLV", "XLU"],
    sectorEtfs: ["XLF", "XLK"],
    newsKeywords: ["inflation", "cpi", "ppi", "fed", "rates", "yield", "treasury", "powell"],
  },
  {
    id: "ai",
    why: "When technology leads, major indexes often rise even when other parts of the economy slow down.",
    impactSectors: ["Technology", "Semiconductors", "Cloud"],
    globeStoryId: "ai",
    quoteSymbols: ["NVDA", "AMD", "AVGO", "XLK", "QQQ", "SOXX"],
    sectorEtfs: ["XLK", "SOXX"],
    newsKeywords: ["ai", "artificial intelligence", "nvidia", "chip", "semiconductor", "capex", "hyperscaler"],
  },
  {
    id: "europe",
    why: "Investors often move money toward stronger economies, which can lift US stocks and the dollar.",
    impactSectors: ["Technology", "Large US companies", "Currency markets"],
    globeStoryId: "europe",
    quoteSymbols: ["SPY", "EWG", "UUP", "QQQ"],
    sectorEtfs: ["SPY"],
    newsKeywords: ["europe", "eurozone", "ecb", "germany", "france", "dollar", "transatlantic"],
  },
  {
    id: "energy",
    why: "When energy rises without wild price swings, it can support the broader market without adding panic.",
    impactSectors: ["Energy", "Transportation", "Oil & gas"],
    globeStoryId: "energy",
    quoteSymbols: ["XLE", "XOM", "CVX", "SPY"],
    sectorEtfs: ["XLE"],
    newsKeywords: ["oil", "crude", "opec", "energy", "gasoline", "petroleum", "supply"],
  },
];

/** @type {Record<string, StoryRegistryEntry>} */
export const STORY_REGISTRY_BY_ID = Object.fromEntries(
  STORY_REGISTRY.map((s) => [s.id, s])
);

/** All quote symbols needed across stories (deduped). */
export const ALL_STORY_QUOTE_SYMBOLS = [
  ...new Set(STORY_REGISTRY.flatMap((s) => s.quoteSymbols)),
];

/** Compact labels for since-last-visit lines. */
export const STORY_SHORT_LABEL = {
  inflation: "Inflation",
  ai: "AI",
  europe: "US vs Europe",
  energy: "Energy",
};
