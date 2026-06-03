/**
 * Metadata for custom Relationship Story groups (preview).
 * @module design-lab/move-together/story/custom-relationship-meta
 */

import { edgesFor, other, stock } from "/design-lab/move-together/_together-mock.js";
import { MOVERS_SYMBOL_DIRECTORY } from "/lib/moversSymbolLookup.js";
const MOVERS_BY_SYMBOL = new Map(
  MOVERS_SYMBOL_DIRECTORY.map(([symbol, name, sector]) => [symbol, { name, sector }])
);

const AI_CHIP = new Set(["NVDA", "AMD", "AVGO", "INTC", "QCOM", "TSM", "MU", "ARM", "SMCI"]);
const CLOUD = new Set(["MSFT", "GOOGL", "AMZN", "ORCL", "CRM", "SNOW"]);
const DIGITAL_PLATFORM = new Set(["META", "GOOGL", "AMZN", "NFLX"]);

const MOVERS_SECTOR_THEME = {
  Tech: "Technology",
  Financials: "Financials",
  Energy: "Energy",
  Healthcare: "Healthcare",
  Consumer: "Consumer",
  Industrial: "Industrial",
  ETF: "Broad Market",
};

const MOCK_SECTOR_THEME = {
  ai: "Technology",
  banks: "Financials",
  energy: "Energy",
  health: "Healthcare",
  market: "Broad Market",
};

/** @type {Record<string, string[]>} */
const THEME_PAIR_COPY = {
  Technology: [
    "Both companies are influenced by technology spending and demand for computing infrastructure.",
    "Investor sentiment toward the technology sector can affect both stocks at the same time.",
  ],
  "AI Infrastructure": [
    "Both names are tied to spending on AI servers, chips, and data centre build-out.",
    "When AI demand headlines move the market, these stocks often react together.",
  ],
  "Cloud Computing": [
    "Both companies compete in cloud services and enterprise software.",
    "News about cloud growth and AI product rollouts often moves them in step.",
  ],
  "Digital Platforms": [
    "Both rely on large user platforms and digital advertising revenue.",
    "Ad budgets and engagement trends often sway investor views on both names.",
  ],
  Financials: [
    "Both are exposed to interest rates and the health of the banking system.",
    "When rate expectations shift, investors often trade financial stocks together.",
  ],
  Energy: [
    "Both are sensitive to oil prices and global energy demand.",
    "When crude moves sharply, energy names often rise or fall as a group.",
  ],
  Healthcare: [
    "Both sit in the healthcare sector and follow policy and demand trends.",
    "Defensive flows and sector news often affect these stocks together.",
  ],
  "Broad Market": [
    "Both track broad market risk appetite and macro headlines.",
    "When the index moves, these names often follow the same direction.",
  ],
  "Consumer": [
    "Both depend on consumer spending and sentiment.",
    "Retail and demand headlines often move these stocks in tandem.",
  ],
  Industrial: [
    "Both are tied to industrial activity and the economic cycle.",
    "Growth and capex news often affects this part of the market together.",
  ],
  "Mixed Exposure": [
    "These names sit in different parts of the market with fewer shared drivers.",
    "They may still move together on days when broad risk appetite dominates.",
  ],
};

/** @type {Record<string, string[]>} */
const THEME_GROUP_COPY = {
  Technology: [
    "These companies are often grouped when technology spending is in focus.",
    "Hover a partner to see how each name links back to the hero.",
  ],
  "AI Infrastructure": [
    "These names often trade on the same AI infrastructure story.",
    "Hover a partner to see the clearest link in plain English.",
  ],
  "Mixed Exposure": [
    "This group spans more than one market theme.",
    "Hover a partner to compare how each name relates to the hero.",
  ],
};

/**
 * @param {string} sym
 */
function mockSector(sym) {
  return stock(sym)?.sector || null;
}

/**
 * @param {string} sym
 */
function moversSector(sym) {
  return MOVERS_BY_SYMBOL.get(sym)?.sector || "";
}

/**
 * @param {string} sym
 */
function sectorBucket(sym) {
  return mockSector(sym) || MOVERS_SECTOR_THEME[moversSector(sym)] || null;
}

/**
 * @param {string[]} symbols
 */
export function deriveSharedTheme(symbols) {
  const list = symbols.map((s) => String(s).toUpperCase());
  const mockTags = list.map(mockSector).filter(Boolean);
  const uniqueMock = new Set(mockTags);

  if (uniqueMock.size > 1) return refineMixedTheme(list);
  if (uniqueMock.size === 1) {
    const tag = [...uniqueMock][0];
    if (tag === "ai") return refineAiTheme(list);
    return MOCK_SECTOR_THEME[tag] || "Mixed Exposure";
  }

  const moverTags = list.map(moversSector).filter(Boolean);
  const uniqueMover = new Set(moverTags);
  if (uniqueMover.size > 1) return "Mixed Exposure";
  if (uniqueMover.size === 1) {
    const ms = [...uniqueMover][0];
    if (ms === "Tech") return refineTechTheme(list);
    return MOVERS_SECTOR_THEME[ms] || "Mixed Exposure";
  }

  return "Mixed Exposure";
}

/**
 * @param {string[]} symbols
 */
function refineAiTheme(symbols) {
  const chips = symbols.filter((s) => AI_CHIP.has(s)).length;
  const cloud = symbols.filter((s) => CLOUD.has(s)).length;
  if (chips >= symbols.length - 1 && chips >= 2) return "AI Infrastructure";
  if (cloud >= symbols.length - 1 && cloud >= 2) return "Cloud Computing";
  if (symbols.some((s) => DIGITAL_PLATFORM.has(s)) && symbols.length <= 4) {
    return "Digital Platforms";
  }
  return "Technology";
}

/**
 * @param {string[]} symbols
 */
function refineTechTheme(symbols) {
  return refineAiTheme(symbols);
}

/**
 * @param {string[]} symbols
 */
function refineMixedTheme(symbols) {
  const themes = new Set(symbols.map((s) => {
    const m = mockSector(s);
    if (m === "ai") return refineAiTheme([s]);
    if (m) return MOCK_SECTOR_THEME[m];
    return MOVERS_SECTOR_THEME[moversSector(s)] || "Mixed Exposure";
  }));
  if (themes.size === 1) return [...themes][0];
  return "Mixed Exposure";
}

/**
 * @param {string} hero
 * @param {string} peer
 */
export function estimatePairStrength(hero, peer) {
  const edge = edgesFor(hero).find((e) => other(hero, e) === peer);
  if (edge?.r != null) {
    return {
      mode: /** @type {'estimated'} */ ("estimated"),
      pct: Math.round(edge.r * 100),
      hasCorrelation: true,
    };
  }

  const h = sectorBucket(hero);
  const p = sectorBucket(peer);
  if (h && p && h === p) {
    return {
      mode: /** @type {'estimated'} */ ("estimated"),
      pct: null,
      hasCorrelation: false,
    };
  }

  const heroMover = moversSector(hero);
  const peerMover = moversSector(peer);
  if (heroMover && peerMover && heroMover === peerMover) {
    return {
      mode: /** @type {'estimated'} */ ("estimated"),
      pct: null,
      hasCorrelation: false,
    };
  }

  return {
    mode: /** @type {'unavailable'} */ ("unavailable"),
    pct: null,
    hasCorrelation: false,
  };
}

/**
 * @typedef {Object} CustomRelationshipMeta
 * @property {string} theme
 * @property {{ mode: 'estimated' | 'unavailable', pct: number | null, hasCorrelation: boolean }} groupStrength
 */

/**
 * @param {string} hero
 * @param {string[]} relatives
 * @param {Record<string, string>} [symbolNames]
 * @returns {CustomRelationshipMeta}
 */
export function buildCustomRelationshipMeta(hero, relatives, symbolNames = {}) {
  const all = [hero, ...relatives];
  const theme = deriveSharedTheme(all);

  const strengths = relatives.map((peer) => estimatePairStrength(hero, peer));
  const withData = strengths.find((s) => s.hasCorrelation);
  const anyEstimated = strengths.some((s) => s.mode === "estimated");

  let groupStrength;
  if (withData) {
    groupStrength = { mode: "estimated", pct: withData.pct, hasCorrelation: true };
  } else if (anyEstimated) {
    groupStrength = { mode: "estimated", pct: null, hasCorrelation: false };
  } else {
    groupStrength = { mode: "unavailable", pct: null, hasCorrelation: false };
  }

  return { theme, groupStrength, symbolNames, hero, relatives };
}

/**
 * @param {CustomRelationshipMeta} meta
 * @param {string} peer
 */
export function pairStrengthForCustom(meta, peer) {
  if (typeof meta.pairStrength === "function") {
    return meta.pairStrength(peer);
  }
  return estimatePairStrength(meta.hero, peer);
}

/**
 * @param {string} theme
 * @returns {string[]}
 */
export function themePairSentences(theme) {
  return THEME_PAIR_COPY[theme] || THEME_PAIR_COPY.Technology;
}

/**
 * @param {string} theme
 * @returns {string[]}
 */
export function themeGroupSentences(theme) {
  return THEME_GROUP_COPY[theme] || THEME_GROUP_COPY.Technology;
}