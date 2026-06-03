/**
 * Production Portfolio · Relationship Story (same mount as design-lab preview).
 * @module lib/portfolio-relationship-story
 */

import { deriveSharedTheme } from "/design-lab/move-together/story/custom-relationship-meta.js";
import { initPortfolioRelationshipCustomGroup } from "/lib/portfolio-relationship-custom-group.js";

/** @type {import('/design-lab/move-together/story/relationship-story.js').mountRelationshipStory | null} */
let mountRelationshipStory = null;

/** @type {import('/design-lab/move-together/story/relationship-story.js').DEFAULT_EPISODES | null} */
let defaultEpisodes = null;

/** @type {ReturnType<typeof mountRelationshipStory> | null} */
let storyApi = null;

/** @type {object | null} */
let holdingsEpisode = null;

/** @type {object | null} */
let customEpisode = null;

/** Max related cards in production (matches design-lab NVDA preset). */
const MAX_RELATED_CARDS = 3;

/** NVDA story curation — design-lab default peers. */
const NVDA_PREFERRED_PEERS = ["AMD", "AVGO", "MSFT"];

/** Deprioritised for NVDA / AI-infrastructure stories (mega-cap platforms). */
const NVDA_DEPRIORITISED = new Set(["AAPL", "GOOGL", "GOOG", "META", "AMZN"]);

/** Design-lab-style pair strengths when live matrix unavailable. */
const NVDA_PAIR_STRENGTH = { AMD: 84, AVGO: 79, MSFT: 72 };

/** Debounce cluster/quote sync before updating the story. */
const SYNC_DEBOUNCE_MS = 200;

/** Wait for holdings before showing NVDA fallback preset. */
const HOLDINGS_WAIT_MS = 250;

/** @type {string} */
let lastRenderedEpisodeKey = "";

/** @type {ReturnType<typeof setTimeout> | null} */
let syncDebounceTimer = null;

/** @type {{ holdings?: { symbol: string, weight: number }[], matrix?: Record<string, Record<string, number>> | null } | null} */
let pendingSyncArgs = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let fallbackMountTimer = null;

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
  const n = Math.max(1, Math.min(count, MAX_RELATED_CARDS));
  return layouts[n] || layouts[3];
}

/**
 * @param {object | null | undefined} episode
 */
function episodeRenderKey(episode) {
  if (!episode) return "";
  return `${episode.source || "preset"}:${episode.hero}:${(episode.relatives || []).join(",")}`;
}

function mergeEpisodes() {
  const presets = (defaultEpisodes || []).map((ep) => ({
    ...ep,
    source: ep.source || "preset",
  }));
  const episodes = [...presets];
  if (holdingsEpisode) {
    episodes.push({
      ...holdingsEpisode,
      pickerLabel: holdingsEpisode.pickerLabel || "Portfolio",
    });
  }
  if (customEpisode) episodes.push(customEpisode);
  return episodes;
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
  if (hero === "NVDA" && NVDA_PAIR_STRENGTH[peer] != null) {
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
    return {
      mode: /** @type {'correlated'} */ ("correlated"),
      pct: NVDA_PAIR_STRENGTH[peer],
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
  let theme = deriveSharedTheme(all);
  if (
    hero === "NVDA" &&
    relatives.length &&
    relatives.every((sym) => NVDA_PREFERRED_PEERS.includes(sym))
  ) {
    theme = "AI Infrastructure";
  }

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
  const symbolSet = new Set(holdings.map((h) => h.symbol));
  const others = holdings.filter((h) => h.symbol !== hero);
  if (!others.length) return [];

  if (hero === "NVDA") {
    const curated = NVDA_PREFERRED_PEERS.filter((sym) => symbolSet.has(sym));
    if (curated.length >= MAX_RELATED_CARDS) {
      return curated.slice(0, MAX_RELATED_CARDS);
    }

    const heroTheme = String(getMeta(hero).theme || "").toLowerCase();
    const fill = others
      .filter((h) => !curated.includes(h.symbol) && !NVDA_DEPRIORITISED.has(h.symbol))
      .map((h) => {
        let score = h.weight;
        if (/ai infrastructure/i.test(getMeta(h.symbol).theme || "")) score += 60;
        if (heroTheme && String(getMeta(h.symbol).theme || "").toLowerCase() === heroTheme) {
          score += 40;
        }
        if (matrix) {
          const r = matrix[hero]?.[h.symbol] ?? matrix[h.symbol]?.[hero];
          if (r != null && Number.isFinite(r)) score += Math.abs(r) * 100;
        }
        return { symbol: h.symbol, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((row) => row.symbol);

    return [...curated, ...fill].slice(0, MAX_RELATED_CARDS);
  }

  const heroSector = sectorBucketFromMeta(hero);
  const heroTheme = String(getMeta(hero).theme || "").toLowerCase();
  const isAiHero =
    hero === "NVDA" || /ai infrastructure/i.test(String(getMeta(hero).theme || ""));

  return others
    .map((h) => {
      let score = h.weight;
      if (heroSector && sectorBucketFromMeta(h.symbol) === heroSector) score += 50;
      const peerTheme = String(getMeta(h.symbol).theme || "").toLowerCase();
      if (heroTheme && peerTheme && peerTheme === heroTheme) score += 40;
      if (isAiHero && NVDA_DEPRIORITISED.has(h.symbol)) score -= 80;
      if (matrix) {
        const r = matrix[hero]?.[h.symbol] ?? matrix[h.symbol]?.[hero];
        if (r != null && Number.isFinite(r)) score += Math.abs(r) * 100;
      }
      return { symbol: h.symbol, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_CARDS)
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
    relatives = sorted
      .slice(1, 1 + MAX_RELATED_CARDS)
      .map((h) => h.symbol);
  }
  relatives = relatives.slice(0, MAX_RELATED_CARDS);
  const symbolNames = Object.fromEntries(
    sorted.map((h) => [h.symbol, companyLabel(h.symbol)])
  );
  const relationshipMeta = buildHoldingsMeta(hero, relatives, symbolNames, matrix);

  return {
    id: `holdings-${hero}`,
    source: "holdings",
    hero,
    relatives,
    positions: layoutRelativePositions(Math.min(relatives.length, MAX_RELATED_CARDS)),
    pickerLabel: hero,
    symbolNames,
    relationshipMeta,
  };
}

/**
 * @param {HTMLElement} mount
 */
function showStorySkeleton(mount) {
  if (!mount || mount.querySelector(".port-relationship-skeleton")) return;
  mount.hidden = false;
  mount.classList.add("is-loading", "is-empty");
  mount.classList.remove("is-ready", "is-fallback");
  mount.innerHTML = `
    <div class="port-relationship-skeleton" aria-busy="true" aria-label="Loading relationship story">
      <div class="port-relationship-skeleton__stage">
        <div class="port-relationship-skeleton__hero"></div>
      </div>
      <div class="port-relationship-skeleton__panel"></div>
    </div>`;
}

function clearFallbackMountTimer() {
  if (fallbackMountTimer) {
    clearTimeout(fallbackMountTimer);
    fallbackMountTimer = null;
  }
}

/**
 * @param {HTMLElement} mount
 * @param {string} reason
 */
function renderErrorCard(mount, reason) {
  clearFallbackMountTimer();
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
 */
function updateMountForEpisode(mount, episode) {
  if (!episode) return;
  mount.hidden = false;
  mount.classList.remove("is-empty", "is-fallback");
  mount.classList.add("is-ready");
  mount.classList.toggle(
    "port-relationship-mount--three",
    episode.relatives?.length === MAX_RELATED_CARDS
  );
  mount.removeAttribute("hidden");

  const unavailable = document.getElementById("portRelationshipUnavailable");
  if (unavailable) unavailable.hidden = true;

  const section = document.querySelector(".port-relationship-section");
  if (section) section.classList.remove("is-unavailable");
}

/**
 * @param {number} [playIndex]
 * @param {{ force?: boolean, mode?: string }} [opts]
 */
function syncStoryEpisodes(playIndex, opts = {}) {
  const mount = document.getElementById("relationshipStoryMount");
  if (!mount || !mountRelationshipStory) return;

  const episodes = mergeEpisodes();
  if (!episodes.length) return;

  let idx = playIndex;
  if (idx === undefined && holdingsEpisode) {
    idx = episodes.findIndex((e) => e.source === "holdings");
  }
  if (idx === undefined || idx < 0) idx = 0;

  const active = episodes[idx];
  const renderKey = episodeRenderKey(active);
  const force = opts.force === true;

  if (storyApi && !force && renderKey === lastRenderedEpisodeKey) {
    log("render skipped unchanged episode", { key: renderKey });
    return;
  }

  if (!storyApi) {
    mount.classList.remove("is-loading");
    storyApi = mountRelationshipStory(mount, {
      layout: "embed",
      episodes,
      defaultEpisode: idx,
      hidePicker: false,
      onEpisodeChange: (ep) => updateMountForEpisode(mount, ep),
    });

    initPortfolioRelationshipCustomGroup({
      getStoryApi: () => storyApi,
      mergeEpisodes,
      setCustomEpisode: (ep) => {
        customEpisode = ep;
      },
      onCustomEpisode: (ep) => {
        lastRenderedEpisodeKey = episodeRenderKey(ep);
        updateMountForEpisode(mount, ep);
      },
    });

    if (opts.mode === "holdings") {
      log("render holdings episode", {
        hero: active?.hero,
        relatives: active?.relatives,
      });
    } else if (opts.mode === "fallback") {
      log("render fallback episode", {
        hero: active?.hero,
        relatives: active?.relatives,
      });
    }
  } else {
    storyApi.setEpisodes(episodes, { playIndex: idx, force });
    if (opts.mode === "holdings") {
      log("render holdings episode", {
        hero: active?.hero,
        relatives: active?.relatives,
      });
    } else if (opts.mode === "fallback") {
      log("render fallback episode", {
        hero: active?.hero,
        relatives: active?.relatives,
      });
    }
  }

  lastRenderedEpisodeKey = renderKey;
  updateMountForEpisode(mount, active);
}

/**
 * @param {{ symbol: string, weight: number }[]} [holdings]
 * @param {Record<string, Record<string, number>> | null} [matrix]
 */
function applyPortfolioRelationshipSync(holdings, matrix = null) {
  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) return;

  if (!mountRelationshipStory) {
    renderErrorCard(mount, "Relationship story module failed to import");
    return;
  }

  const resolved = resolveHoldingsInput(holdings);
  const mat = matrix ?? window._portClusterMatrix ?? null;

  try {
    if (resolved.length >= 2) {
      clearFallbackMountTimer();
      const nextEpisode = buildHoldingsEpisode(resolved, mat);
      const renderKey = episodeRenderKey(nextEpisode);

      if (storyApi && renderKey === lastRenderedEpisodeKey) {
        log("render skipped unchanged episode", { key: renderKey });
        return;
      }

      holdingsEpisode = nextEpisode;
      const episodes = mergeEpisodes();
      const idx = episodes.findIndex((e) => e.source === "holdings");
      syncStoryEpisodes(idx >= 0 ? idx : episodes.length - 1, {
        force: !storyApi,
        mode: "holdings",
      });
      return;
    }

    if (storyApi) {
      if (!holdingsEpisode) {
        log("render skipped unchanged episode", { key: lastRenderedEpisodeKey, reason: "no holdings" });
      }
      return;
    }

    clearFallbackMountTimer();
    holdingsEpisode = null;
    syncStoryEpisodes(0, { force: true, mode: "fallback" });
  } catch (err) {
    console.error("[portfolio-relationship] sync failed", err);
    renderErrorCard(mount, err?.message || String(err));
  }
}

/**
 * @param {{ symbol: string, weight: number }[]} [holdings]
 * @param {Record<string, Record<string, number>> | null} [matrix]
 * @param {{ immediate?: boolean }} [opts]
 */
function queuePortfolioRelationshipSync(holdings, matrix = null, opts = {}) {
  const resolved = resolveHoldingsInput(holdings);
  if (resolved.length >= 2) {
    clearFallbackMountTimer();
  }

  pendingSyncArgs = { holdings, matrix };
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  const delay = opts.immediate ? 0 : SYNC_DEBOUNCE_MS;
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    const args = pendingSyncArgs;
    pendingSyncArgs = null;
    if (!args) return;
    applyPortfolioRelationshipSync(args.holdings, args.matrix ?? null);
  }, delay);
}

/**
 * @param {{ symbol: string, weight: number }[]} [holdings]
 * @param {Record<string, Record<string, number>> | null} [matrix]
 */
export function syncPortfolioRelationshipStory(holdings, matrix = null) {
  queuePortfolioRelationshipSync(holdings, matrix);
}

function flushPendingSync() {
  const pending = window.__portfolioRelationshipPending;
  if (!pending) return;
  delete window.__portfolioRelationshipPending;
  queuePortfolioRelationshipSync(pending.holdings, pending.matrix, { immediate: true });
}

function scheduleFallbackMount() {
  clearFallbackMountTimer();
  fallbackMountTimer = setTimeout(() => {
    fallbackMountTimer = null;
    if (storyApi) return;
    if (pendingSyncArgs || syncDebounceTimer) return;
    if (resolveHoldingsInput().length >= 2) {
      queuePortfolioRelationshipSync(
        resolveHoldingsInput(),
        window._portClusterMatrix || null,
        { immediate: true }
      );
      return;
    }
    const mount = document.getElementById("relationshipStoryMount");
    if (!mount || !mountRelationshipStory) return;
    holdingsEpisode = null;
    syncStoryEpisodes(0, { force: true, mode: "fallback" });
  }, HOLDINGS_WAIT_MS);
}

async function boot() {
  log("script loaded");

  const mount = document.getElementById("relationshipStoryMount");
  if (!mount) {
    log("container", { found: false });
    return;
  }

  showStorySkeleton(mount);

  try {
    const storyModule = await import(
      "/design-lab/move-together/story/relationship-story.js"
    );
    mountRelationshipStory = storyModule.mountRelationshipStory;
    defaultEpisodes = storyModule.DEFAULT_EPISODES;
    log("importing mountRelationshipStory ok");
  } catch (err) {
    console.error("[portfolio-relationship] import failed", err);
    renderErrorCard(mount, err?.message || String(err));
    return;
  }

  const initialHoldings = resolveHoldingsInput();
  if (initialHoldings.length >= 2) {
    queuePortfolioRelationshipSync(
      initialHoldings,
      window._portClusterMatrix || null,
      { immediate: true }
    );
  } else {
    scheduleFallbackMount();
  }

  flushPendingSync();
}

if (typeof window !== "undefined") {
  window.__portfolioRelationshipSync = (holdings, matrix) => {
    if (!mountRelationshipStory) {
      window.__portfolioRelationshipPending = { holdings, matrix };
      return;
    }
    queuePortfolioRelationshipSync(holdings, matrix);
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
  });
}
