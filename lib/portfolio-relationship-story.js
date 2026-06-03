/**
 * Production Portfolio · Relationship Story (holdings-driven).
 * @module lib/portfolio-relationship-story
 */

import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";
import {
  deriveSharedTheme,
  layoutRelativePositions,
} from "/design-lab/move-together/story/custom-relationship-meta.js";

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

/**
 * @param {string} sym
 */
function getMeta(sym) {
  if (typeof window.getPortfolioMeta === "function") {
    return window.getPortfolioMeta(sym);
  }
  return { name: sym, sector: "Other", theme: "" };
}

/**
 * @param {string} sym
 */
function companyLabel(sym) {
  const name = getMeta(sym).name || sym;
  return String(name)
    .replace(/\s+(Corporation|Inc\.?|Platforms|Co\.?)$/i, "")
    .trim();
}

/**
 * @param {string} sym
 */
function sectorBucketFromMeta(sym) {
  const sector = String(getMeta(sym).sector || "");
  if (/information technology|technology|tech/i.test(sector)) return "tech";
  if (/financial/i.test(sector)) return "financials";
  if (/energy/i.test(sector)) return "energy";
  if (/health/i.test(sector)) return "healthcare";
  if (/communication/i.test(sector)) return "tech";
  if (/consumer/i.test(sector)) return "consumer";
  if (/industrial/i.test(sector)) return "industrial";
  return sector.toLowerCase() || "other";
}

/**
 * @param {string} hero
 * @param {string} peer
 * @param {Record<string, Record<string, number>> | null} matrix
 */
export function estimatePairStrengthProduction(hero, peer, matrix) {
  if (matrix) {
    const r = matrix[hero]?.[peer] ?? matrix[peer]?.[hero];
    if (r != null && Number.isFinite(r)) {
      return {
        mode: /** @type {'correlated'} */ ("correlated"),
        pct: Math.round(Math.abs(r) * 100),
        hasCorrelation: true,
      };
    }
  }

  const tagH = sectorBucketFromMeta(hero);
  const tagP = sectorBucketFromMeta(peer);
  if (tagH && tagP && tagH === tagP) {
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
 * @param {string} hero
 * @param {string[]} relatives
 * @param {Record<string, string>} symbolNames
 * @param {Record<string, Record<string, number>> | null} matrix
 */
function buildHoldingsMeta(hero, relatives, symbolNames, matrix) {
  const all = [hero, ...relatives];
  const theme = deriveSharedThemeFromHoldings(all);

  const strengths = relatives.map((peer) =>
    estimatePairStrengthProduction(hero, peer, matrix)
  );
  const withData = strengths.find((s) => s.mode === "correlated");
  const anyEstimated = strengths.some((s) => s.mode === "estimated");

  let groupStrength;
  if (withData) {
    groupStrength = {
      mode: "correlated",
      pct: withData.pct,
      hasCorrelation: true,
    };
  } else if (anyEstimated) {
    groupStrength = { mode: "estimated", pct: null, hasCorrelation: false };
  } else {
    groupStrength = { mode: "unavailable", pct: null, hasCorrelation: false };
  }

  const meta = {
    theme,
    groupStrength,
    symbolNames,
    hero,
    relatives,
    matrix,
  };

  meta.pairStrength = (peer) => estimatePairStrengthProduction(hero, peer, matrix);

  return meta;
}

/**
 * @param {string[]} symbols
 */
function deriveSharedThemeFromHoldings(symbols) {
  const tags = symbols.map(sectorBucketFromMeta);
  const unique = [...new Set(tags.filter((t) => t && t !== "other"))];
  if (unique.length > 1) return "Mixed Exposure";
  if (unique.length === 1) {
    const map = {
      tech: "Technology",
      financials: "Financials",
      energy: "Energy",
      healthcare: "Healthcare",
      consumer: "Consumer",
      industrial: "Industrial",
    };
    return map[unique[0]] || "Mixed Exposure";
  }
  return deriveSharedTheme(symbols);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
export function buildHoldingsEpisode(holdings, matrix) {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const hero = sorted[0].symbol;
  const relatives = sorted.slice(1, 6).map((h) => h.symbol);
  const symbolNames = Object.fromEntries(
    sorted.map((h) => [h.symbol, companyLabel(h.symbol)])
  );
  const relationshipMeta = buildHoldingsMeta(hero, relatives, symbolNames, matrix);

  return {
    id: `holdings-${hero}`,
    source: "holdings",
    hero,
    relatives,
    positions: layoutRelativePositions(relatives.length),
    pickerLabel: hero,
    symbolNames,
    relationshipMeta,
  };
}

function setUnavailable(show) {
  const unavailable = document.getElementById("portRelationshipUnavailable");
  const mount = document.getElementById("relationshipStoryMount");
  if (unavailable) unavailable.hidden = !show;
  if (mount) mount.hidden = show;
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} [matrix]
 */
export function syncPortfolioRelationshipStory(holdings, matrix = null) {
  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) return;

  if (!holdings?.length || holdings.length < 2) {
    if (storyApi) {
      storyApi.destroy();
      storyApi = null;
    }
    mount.innerHTML = "";
    setUnavailable(true);
    return;
  }

  setUnavailable(false);

  const episode = buildHoldingsEpisode(holdings, matrix || window._portClusterMatrix || null);

  if (storyApi) {
    storyApi.setEpisodes([episode], { playIndex: 0 });
    return;
  }

  storyApi = mountRelationshipStory(mount, {
    layout: "embed",
    episodes: [episode],
    defaultEpisode: 0,
    hidePicker: true,
  });
}

if (typeof window !== "undefined") {
  window.__portfolioRelationshipSync = syncPortfolioRelationshipStory;
}
