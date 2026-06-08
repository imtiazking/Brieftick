/**
 * Static Dashboard News story registry — permanent Brieftick intelligence categories.
 * @module lib/dashboard-news-story-registry
 */

/**
 * @typedef {Object} StoryRegistryEntry
 * @property {string} id
 * @property {boolean} [primary]
 * @property {string} headline
 * @property {string} what
 * @property {string} why
 * @property {string[]} impactSectors
 * @property {string[]} watchingTemplates
 * @property {string} shortTitle
 * @property {string} globeStoryId
 * @property {string[]} quoteSymbols
 * @property {string[]} sectorEtfs
 * @property {string[]} newsKeywords
 */

/** @type {StoryRegistryEntry[]} */
export const STORY_REGISTRY = [
  {
    id: "inflation",
    primary: true,
    headline: "Inflation Is Driving Markets",
    what: "Higher inflation expectations are influencing interest rates and technology stocks.",
    why: "Higher rates can make growth stocks less attractive.",
    impactSectors: ["Technology", "Banks", "Energy"],
    watchingTemplates: [
      "Softer inflation data",
      "Dovish Fed comments",
      "Next CPI and PPI reports",
    ],
    shortTitle: "Inflation is driving markets",
    globeStoryId: "inflation",
    quoteSymbols: ["XLF", "XLK", "SPY", "QQQ"],
    sectorEtfs: ["XLF", "XLK"],
    newsKeywords: ["inflation", "cpi", "ppi", "fed", "rates", "yield", "treasury", "powell"],
  },
  {
    id: "ai",
    headline: "AI Spending Is Lifting Tech Stocks",
    what: "Large companies are still investing heavily in artificial intelligence, which helps chip and software stocks.",
    why: "When technology leads, major indexes often rise even when other parts of the economy slow down.",
    impactSectors: ["Technology", "Semiconductors", "Cloud"],
    watchingTemplates: [
      "Big tech earnings guidance",
      "New AI product launches",
      "Cuts to hyperscaler capex plans",
    ],
    shortTitle: "AI spending lifts tech",
    globeStoryId: "ai",
    quoteSymbols: ["NVDA", "AMD", "AVGO", "XLK", "QQQ", "SOXX"],
    sectorEtfs: ["XLK", "SOXX"],
    newsKeywords: ["ai", "artificial intelligence", "nvidia", "chip", "semiconductor", "capex", "hyperscaler"],
  },
  {
    id: "europe",
    headline: "US Markets Are Outpacing Europe",
    what: "American stocks are rising while growth in Europe looks weaker.",
    why: "Investors often move money toward stronger economies, which can lift US stocks and the dollar.",
    impactSectors: ["Technology", "Large US companies", "Currency markets"],
    watchingTemplates: [
      "European economic reports",
      "ECB policy signals",
      "US sales abroad and dollar moves",
    ],
    shortTitle: "US ahead of Europe",
    globeStoryId: "europe",
    quoteSymbols: ["SPY", "EWG", "UUP", "QQQ"],
    sectorEtfs: ["SPY"],
    newsKeywords: ["europe", "eurozone", "ecb", "germany", "france", "dollar", "transatlantic"],
  },
  {
    id: "energy",
    headline: "Steady Oil Prices Are Helping Energy Stocks",
    what: "Oil prices are holding in a stable range, giving energy companies more predictable profits.",
    why: "When energy rises without wild price swings, it can support the broader market without adding panic.",
    impactSectors: ["Energy", "Transportation", "Oil & gas"],
    watchingTemplates: [
      "Oil supply and OPEC updates",
      "Energy company earnings",
      "Geopolitical shocks to supply",
    ],
    shortTitle: "Oil steady, energy firm",
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
