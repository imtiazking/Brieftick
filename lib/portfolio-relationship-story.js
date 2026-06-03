/**
 * Production Portfolio · Relationship Story (same mount as design-lab preview).
 * @module lib/portfolio-relationship-story
 */

import { deriveSharedTheme } from "/design-lab/move-together/story/custom-relationship-meta.js";

/** @type {import('/design-lab/move-together/story/relationship-story.js').mountRelationshipStory | null} */
let mountRelationshipStory = null;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

let fallbackMounted = false;
let holdingsMounted = false;

/** @param {string} tag @param {unknown} [data] */
function log(tag, data) {
  if (data === undefined) {
    console.log(`[portfolio-relationship] ${tag}`);
  } else {
    console.log(`[portfolio-relationship] ${tag}`, data);
  }
}

/**
 * @param {number} count
 */
function layoutRelativePositions(count) {
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
  const n = Math.max(1, Math.min(count, 5));
  return layouts[n] || layouts[3];
}

/**
 * Design-lab NVDA preset (same visual as /design-lab/portfolio-relationship-story).
 */
function buildFallbackEpisode() {
  return {
    id: "fallback-nvda",
    source: "preset",
    hero: "NVDA",
    relatives: ["AMD", "AVGO", "MSFT"],
    positions: layoutRelativePositions(3),
    pickerLabel: "NVDA",
    symbolNames: {
      NVDA: "NVIDIA",
      AMD: "AMD",
      AVGO: "Broadcom",
      MSFT: "Microsoft",
    },
  };
}

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
 * @returns {{ symbol: string, weight: number }[]}
 */
function resolveHoldingsInput(holdings) {
  if (holdings?.length) return holdings;
  const fromWindow = window._portClusterHoldings;
  if (fromWindow?.length) return fromWindow;
  return [];
}

/**
 * @param {string} hero
 * @param {string} peer
 * @param {Record<string, Record<string, number>> | null} matrix
 */
function estimatePairStrengthProduction(hero, peer, matrix) {
  const fallbackPct = { AMD: 84, AVGO: 79, MSFT: 72 };
  if (fallbackPct[peer] != null && hero === "NVDA" && !matrix) {
    return {
      mode: /** @type {'correlated'} */ ("correlated"),
      pct: fallbackPct[peer],
      hasCorrelation: true,
    };
  }

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
    mode: /** @type {'estimated'} */ ("estimated"),
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
  const theme = deriveSharedTheme(all);

  const strengths = relatives.map((peer) =>
    estimatePairStrengthProduction(hero, peer, matrix)
  );
  const withData = strengths.find((s) => s.mode === "correlated");

  let groupStrength;
  if (withData) {
    groupStrength = {
      mode: "correlated",
      pct: withData.pct,
      hasCorrelation: true,
    };
  } else {
    groupStrength = { mode: "estimated", pct: null, hasCorrelation: false };
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
 * @param {string} hero
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
function pickRelativesForHero(hero, holdings, matrix) {
  const others = holdings.filter((h) => h.symbol !== hero);
  if (!others.length) return [];

  const heroSector = sectorBucketFromMeta(hero);
  const heroTheme = String(getMeta(hero).theme || "").toLowerCase();

  return others
    .map((h) => {
      let score = h.weight;
      if (heroSector && sectorBucketFromMeta(h.symbol) === heroSector) score += 50;
      const peerTheme = String(getMeta(h.symbol).theme || "").toLowerCase();
      if (heroTheme && peerTheme && peerTheme === heroTheme) score += 40;
      if (matrix) {
        const r = matrix[hero]?.[h.symbol] ?? matrix[h.symbol]?.[hero];
        if (r != null && Number.isFinite(r)) score += Math.abs(r) * 100;
      }
      return { symbol: h.symbol, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.symbol);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
export function buildHoldingsEpisode(holdings, matrix) {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const hero = sorted[0].symbol;
  let relatives = pickRelativesForHero(hero, sorted, matrix);
  if (!relatives.length && sorted.length > 1) {
    relatives = sorted.slice(1, 6).map((h) => h.symbol);
  }
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

/**
 * @param {HTMLElement} mount
 * @param {string} reason
 */
function renderErrorCard(mount, reason) {
  const msg = String(reason || "Unknown error").replace(/</g, "&lt;");
  mount.hidden = false;
  mount.classList.remove("is-empty");
  mount.classList.add("is-ready", "is-fallback");
  mount.innerHTML = `
    <div class="port-relationship-fallback" role="alert">
      <p class="port-relationship-fallback__title">Relationship story could not load</p>
      <p class="port-relationship-fallback__detail">${msg}</p>
      <p class="port-relationship-fallback__hint">Check the console for [portfolio-relationship] logs.</p>
    </div>`;
  log("render", { mode: "error", reason: msg });
}

/**
 * @param {HTMLElement} mount
 * @param {object} episode
 * @param {"fallback" | "holdings"} kind
 */
function applyEpisode(mount, episode, kind) {
  if (!mountRelationshipStory) {
    throw new Error("mountRelationshipStory is not available");
  }

  if (!storyApi) {
    storyApi = mountRelationshipStory(mount, {
      layout: "embed",
      episodes: [episode],
      defaultEpisode: 0,
      hidePicker: true,
    });
  } else {
    storyApi.setEpisodes([episode], { playIndex: 0 });
  }

  mount.hidden = false;
  mount.classList.remove("is-empty", "is-fallback");
  mount.classList.add("is-ready");
  mount.removeAttribute("hidden");

  const unavailable = document.getElementById("portRelationshipUnavailable");
  if (unavailable) unavailable.hidden = true;

  const section = document.querySelector(".port-relationship-section");
  if (section) section.classList.remove("is-unavailable");

  if (kind === "fallback") fallbackMounted = true;
  if (kind === "holdings") holdingsMounted = true;
}

/**
 * @param {HTMLElement} mount
 */
function renderFallbackStory(mount) {
  log("rendering fallback episode");
  const episode = buildFallbackEpisode();
  try {
    applyEpisode(mount, episode, "fallback");
    log("render", {
      mode: "fallback",
      hero: episode.hero,
      relatives: episode.relatives,
    });
  } catch (err) {
    console.error("[portfolio-relationship] fallback mount failed", err);
    renderErrorCard(mount, err?.message || String(err));
  }
}

/**
 * @param {HTMLElement} mount
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
function renderHoldingsStory(mount, holdings, matrix) {
  log("rendering holdings episode");
  const episode = buildHoldingsEpisode(holdings, matrix);
  log("episodes", {
    id: episode.id,
    hero: episode.hero,
    relatives: episode.relatives,
    theme: episode.relationshipMeta?.theme,
  });
  try {
    applyEpisode(mount, episode, "holdings");
    log("render", {
      mode: "holdings",
      hero: episode.hero,
      relatives: episode.relatives,
    });
  } catch (err) {
    console.error("[portfolio-relationship] holdings mount failed", err);
    if (!fallbackMounted) {
      renderFallbackStory(mount);
    } else {
      renderErrorCard(mount, err?.message || String(err));
    }
  }
}

/**
 * @param {{ symbol: string, weight: number }[]} [holdings]
 * @param {Record<string, Record<string, number>> | null} [matrix]
 */
export function syncPortfolioRelationshipStory(holdings, matrix = null) {
  const mount = document.getElementById("relationshipStoryMount");
  log("container", {
    found: Boolean(mount),
    hasStoryApi: Boolean(mountRelationshipStory),
    hasMountFn: Boolean(storyApi),
  });

  if (!mount) return;

  if (!mountRelationshipStory) {
    renderErrorCard(mount, "Relationship story module failed to import");
    return;
  }

  const resolved = resolveHoldingsInput(holdings);
  const mat = matrix ?? window._portClusterMatrix ?? null;

  log("holdings", {
    count: resolved.length,
    symbols: resolved.map((h) => h.symbol),
  });

  if (resolved.length >= 2) {
    renderHoldingsStory(mount, resolved, mat);
    return;
  }

  if (!fallbackMounted) {
    renderFallbackStory(mount);
  }
}

function flushPendingSync() {
  const pending = window.__portfolioRelationshipPending;
  if (!pending) return;
  delete window.__portfolioRelationshipPending;
  syncPortfolioRelationshipStory(pending.holdings, pending.matrix);
}

async function boot() {
  log("script loaded");

  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) {
    log("container", { found: false });
    return;
  }

  try {
    const storyModule = await import(
      "/design-lab/move-together/story/relationship-story.js"
    );
    mountRelationshipStory = storyModule.mountRelationshipStory;
    log("importing mountRelationshipStory ok");
  } catch (err) {
    console.error("[portfolio-relationship] import failed", err);
    renderErrorCard(mount, err?.message || String(err));
    return;
  }

  renderFallbackStory(mount);
  flushPendingSync();

  if (window._portClusterHoldings?.length >= 2) {
    syncPortfolioRelationshipStory(
      window._portClusterHoldings,
      window._portClusterMatrix || null
    );
  }
}

if (typeof window !== "undefined") {
  window.__portfolioRelationshipSync = (holdings, matrix) => {
    if (!mountRelationshipStory) {
      window.__portfolioRelationshipPending = { holdings, matrix };
      return;
    }
    syncPortfolioRelationshipStory(holdings, matrix);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot();
    });
  } else {
    boot();
  }

  window.addEventListener("load", () => {
    flushPendingSync();
    if (mountRelationshipStory && window._portClusterHoldings?.length >= 2) {
      syncPortfolioRelationshipStory(
        window._portClusterHoldings,
        window._portClusterMatrix || null
      );
    }
  });
}
