/**
 * Production Portfolio · Relationship Story (same mount as design-lab preview).
 * @module lib/portfolio-relationship-story
 */

import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";
import { deriveSharedTheme } from "/design-lab/move-together/story/custom-relationship-meta.js";
import { layoutRelativePositions } from "/design-lab/portfolio-relationship-story/relationship-tickers.js";

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

/** @param {string} tag @param {unknown} [data] */
function log(tag, data) {
  if (data === undefined) {
    console.log(`[portfolio-relationship] ${tag}`);
  } else {
    console.log(`[portfolio-relationship] ${tag}`, data);
  }
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
 * @param {number} [maxRelatives]
 */
function pickRelativesForHero(hero, holdings, matrix, maxRelatives = 5) {
  const others = holdings.filter((h) => h.symbol !== hero);
  if (!others.length) return [];

  const heroSector = sectorBucketFromMeta(hero);
  const heroTheme = String(getMeta(hero).theme || "").toLowerCase();

  const scored = others.map((h) => {
    let score = h.weight;
    if (heroSector && sectorBucketFromMeta(h.symbol) === heroSector) {
      score += 50;
    }
    const peerTheme = String(getMeta(h.symbol).theme || "").toLowerCase();
    if (heroTheme && peerTheme && peerTheme === heroTheme) {
      score += 40;
    }
    if (matrix) {
      const r = matrix[hero]?.[h.symbol] ?? matrix[h.symbol]?.[hero];
      if (r != null && Number.isFinite(r)) {
        score += Math.abs(r) * 100;
      }
    }
    return { symbol: h.symbol, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRelatives)
    .map((row) => row.symbol);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
export function buildHoldingsEpisode(holdings, matrix) {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const hero = sorted[0].symbol;
  let relatives = pickRelativesForHero(hero, sorted, matrix, 5);
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
 */
function renderProbe(mount) {
  if (!mount.querySelector("[data-rs-probe]")) {
    mount.innerHTML =
      '<p class="port-relationship-mount__probe" data-rs-probe>RELATIONSHIP STORY TEST</p>';
  }
}

/**
 * @param {HTMLElement} mount
 * @param {string} reason
 * @param {{ hero?: string, relatives?: string[] }} [hint]
 */
function renderFallbackCard(mount, reason, hint = {}) {
  const hero = hint.hero || "—";
  const peers = (hint.relatives || []).join(", ") || "—";
  mount.hidden = false;
  mount.classList.remove("is-empty");
  mount.classList.add("is-ready", "is-fallback");
  mount.innerHTML = `
    <div class="port-relationship-fallback" role="alert">
      <p class="port-relationship-fallback__title">Relationship story could not load</p>
      <p class="port-relationship-fallback__detail">${reason}</p>
      <p class="port-relationship-fallback__meta"><strong>Hero:</strong> ${hero} · <strong>Peers:</strong> ${peers}</p>
      <p class="port-relationship-fallback__hint">Reload the page or open the browser console for [portfolio-relationship] logs.</p>
    </div>`;
  log("render", { mode: "fallback", reason, hero, peers });
}

/**
 * @param {HTMLElement} mount
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, Record<string, number>> | null} matrix
 */
function renderStory(mount, holdings, matrix) {
  const episode = buildHoldingsEpisode(holdings, matrix);
  log("episodes", {
    id: episode.id,
    hero: episode.hero,
    relatives: episode.relatives,
    theme: episode.relationshipMeta?.theme,
  });

  try {
    if (storyApi) {
      storyApi.setEpisodes([episode], { playIndex: 0 });
    } else {
      storyApi = mountRelationshipStory(mount, {
        layout: "embed",
        episodes: [episode],
        defaultEpisode: 0,
        hidePicker: true,
      });
    }
    mount.hidden = false;
    mount.classList.remove("is-empty", "is-fallback");
    mount.classList.add("is-ready");
    mount.removeAttribute("hidden");
    log("render", { mode: "story", hero: episode.hero, peers: episode.relatives.length });
  } catch (err) {
    console.error("[portfolio-relationship] mount failed", err);
    if (storyApi) {
      try {
        storyApi.destroy();
      } catch {
        /* ignore */
      }
      storyApi = null;
    }
    renderFallbackCard(mount, err?.message || String(err), {
      hero: episode.hero,
      relatives: episode.relatives,
    });
  }
}

function setUnavailable(show) {
  const unavailable = document.getElementById("portRelationshipUnavailable");
  const mount = document.getElementById("relationshipStoryMount");
  const section = document.querySelector(".port-relationship-section");

  if (unavailable) unavailable.hidden = !show;
  if (mount) {
    if (show) {
      mount.hidden = true;
      mount.classList.add("is-empty");
      mount.classList.remove("is-ready", "is-fallback");
      if (storyApi) {
        storyApi.destroy();
        storyApi = null;
      }
      renderProbe(mount);
    }
  }
  if (section) section.classList.toggle("is-unavailable", show);
}

/**
 * @param {{ symbol: string, weight: number }[]} [holdings]
 * @param {Record<string, Record<string, number>> | null} [matrix]
 */
export function syncPortfolioRelationshipStory(holdings, matrix = null) {
  const mount = document.getElementById("relationshipStoryMount");
  log("container", {
    found: Boolean(mount),
    id: mount?.id,
    hidden: mount?.hidden,
    className: mount?.className,
  });

  if (!mount) return;

  renderProbe(mount);

  const resolved = resolveHoldingsInput(holdings);
  const mat = matrix ?? window._portClusterMatrix ?? null;

  log("holdings", {
    count: resolved.length,
    symbols: resolved.map((h) => h.symbol),
    matrixKeys: mat ? Object.keys(mat).length : 0,
  });

  if (resolved.length < 2) {
    setUnavailable(true);
    return;
  }

  const unavailable = document.getElementById("portRelationshipUnavailable");
  if (unavailable) unavailable.hidden = true;

  const section = document.querySelector(".port-relationship-section");
  if (section) section.classList.remove("is-unavailable");

  renderStory(mount, resolved, mat);
}

function flushPendingSync() {
  const pending = window.__portfolioRelationshipPending;
  if (!pending) return;
  delete window.__portfolioRelationshipPending;
  syncPortfolioRelationshipStory(pending.holdings, pending.matrix);
}

function boot() {
  const mount = document.getElementById("relationshipStoryMount");
  log("container", { boot: true, found: Boolean(mount) });
  if (mount) renderProbe(mount);
  flushPendingSync();
  if (window._portClusterHoldings?.length >= 2) {
    syncPortfolioRelationshipStory(
      window._portClusterHoldings,
      window._portClusterMatrix || null
    );
  }
}

if (typeof window !== "undefined") {
  window.__portfolioRelationshipSync = syncPortfolioRelationshipStory;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("load", boot);
}
