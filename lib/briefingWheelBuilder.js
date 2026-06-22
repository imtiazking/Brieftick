/**
 * Live Briefing Wheel config builder (Phase 1).
 * Same schema as BRIEFING_WHEEL — UI unchanged; intelligence only.
 * @module lib/briefingWheelBuilder
 */

import { BRIEFING_WHEEL } from "/design-lab/wheel-system/_wheel-configs.js";
import { MOVERS_SYMBOL_DIRECTORY } from "/lib/moversSymbolLookup.js";
import { mapSymbolForProvider } from "/lib/landingTickerQuotes.js";

/** @typedef {'Live'|'Mixed'|'Fallback'} BriefingProvenance */

/** @typedef {'up'|'dn'|'flat'} MoveTone */

/**
 * @typedef {Object} BriefingWheelLayer
 * @property {string} layer
 * @property {string} headline
 * @property {string} explanation
 * @property {string} whyItMatters
 * @property {{ name: string, move: string, tone: MoveTone }[]} sectors
 * @property {{ sym: string, name: string, pct: string, role: string }[]} stocks
 * @property {string} reaction
 * @property {string[]} watchNext
 * @property {string} dive
 */

/**
 * @typedef {Object} BriefingWheelConfig
 * @property {string} id
 * @property {string} layout
 * @property {boolean} flagship
 * @property {string} title
 * @property {string} subtitle
 * @property {string} pulseTag
 * @property {string} pulseHeadline
 * @property {{ id: string, label: string }[]} sections
 * @property {Record<string, BriefingWheelLayer>} layers
 * @property {BriefingProvenance} [provenance]
 * @property {Record<string, BriefingProvenance>} [segmentProvenance]
 * @property {string} [provenanceNotes]
 */

const SECTOR_ETFS = [
  ["XLK", "Technology"],
  ["XLF", "Financials"],
  ["XLE", "Energy"],
  ["XLV", "Health Care"],
  ["XLP", "Consumer Staples"],
  ["XLY", "Consumer Disc."],
  ["XLI", "Industrials"],
  ["XLU", "Utilities"],
  ["XLRE", "Real Estate"],
  ["XLC", "Communication"],
];

const INDEX_SYMBOLS = [
  ["SPY", "S&P 500"],
  ["QQQ", "Nasdaq 100"],
  ["DIA", "Dow Jones"],
];

/** Equities scanned for winners / losers (liquid US names). */
const MOVER_UNIVERSE = MOVERS_SYMBOL_DIRECTORY.filter((row) => row[3] === "equity").map(
  (row) => row[0]
);

/** Phase 1 quote batch — keep small so preview wheel init is not blocked for minutes. */
const MOVER_QUOTE_UNIVERSE = MOVER_UNIVERSE.slice(0, 28);

const FETCH_TIMEOUT_MS = 8000;

const NAME_BY_SYM = new Map(MOVERS_SYMBOL_DIRECTORY.map((row) => [row[0], row[1]]));
const SECTOR_BY_SYM = new Map(MOVERS_SYMBOL_DIRECTORY.map((row) => [row[0], row[2]]));

const ROLE_BY_SECTOR = {
  Tech: "Technology",
  Financials: "Banks",
  Energy: "Energy",
  Healthcare: "Healthcare",
  Consumer: "Consumer",
  Other: "Equity",
};

/**
 * @param {object} o
 * @returns {BriefingWheelLayer}
 */
function makeLayer(o) {
  return {
    layer: o.layer,
    headline: o.headline,
    explanation: o.explanation,
    whyItMatters: o.why,
    sectors: o.sectors,
    stocks: o.stocks,
    reaction: o.reaction,
    watchNext: Array.isArray(o.watch) ? o.watch : o.watch ? [o.watch] : [],
    dive: o.dive || o.layer,
  };
}

/**
 * @param {number|null|undefined} n
 * @param {boolean} [signed]
 */
export function fmtPct(n, signed = true) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${signed ? sign : ""}${Math.abs(n).toFixed(2)}%`;
}

/**
 * @param {number|null|undefined} n
 * @returns {MoveTone}
 */
export function toneFromPct(n) {
  if (n == null || !Number.isFinite(n)) return "flat";
  if (Math.abs(n) < 0.05) return "flat";
  return n > 0 ? "up" : "dn";
}

/**
 * @param {string} sym
 * @param {Record<string, { price?: number, pctChange?: number }>} quotes
 */
function stockRow(sym, quotes) {
  const q = quotes[sym];
  const pct = q?.pctChange;
  const sector = SECTOR_BY_SYM.get(sym) || "Other";
  return {
    sym,
    name: NAME_BY_SYM.get(sym) || sym,
    pct: fmtPct(pct),
    role: ROLE_BY_SECTOR[sector] || sector,
  };
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string[]} symbols
 */
async function fetchFinnhubQuotes(symbols) {
  /** @type {Record<string, { price: number, pctChange: number, provider: string }>} */
  const out = {};
  const unique = [...new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean))];
  const BATCH = 8;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (sym) => {
        const fhSym = mapSymbolForProvider(sym, "finnhub");
        try {
          const d = await fetchJson(
            `/api/proxy?provider=finnhub&endpoint=quote&symbol=${encodeURIComponent(fhSym)}`
          );
          if (d && typeof d.c === "number" && d.c > 0) {
            out[sym] = {
              price: d.c,
              pctChange: typeof d.dp === "number" ? d.dp : 0,
              provider: "finnhub",
            };
          }
        } catch {
          /* skip */
        }
      })
    );
    if (i + BATCH < unique.length) {
      await new Promise((r) => setTimeout(r, 160));
    }
  }
  return out;
}

/**
 * @param {string[]} symbols
 */
async function fetchLiveQuotes(symbols) {
  const QR = window.BrieftickQuoteRouter;
  if (QR) return QR.getQuotes(symbols);

  const list = [...new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean))];
  const quotes = await fetchFinnhubQuotes(list);
  const missing = list.filter((s) => !quotes[s]?.price);
  for (const sym of missing) {
    try {
      const d = await fetchJson(
        `/api/proxy?provider=yahoo&symbol=${encodeURIComponent(sym)}`
      );
      if (d?.ok && Number.isFinite(d.price)) {
        quotes[sym] = {
          price: d.price,
          pctChange: d.changePercent ?? 0,
          provider: "yahoo",
        };
      }
    } catch {
      /* skip */
    }
  }
  return quotes;
}

/** @returns {Promise<{ value: number|null, date: string|null }>} */
async function fetchFredVix() {
  try {
    const data = await fetchJson("/api/proxy?provider=fred&series=VIXCLS");
    const value = data?.value != null ? parseFloat(data.value) : null;
    return {
      value: Number.isFinite(value) ? value : null,
      date: data?.date || null,
    };
  } catch {
    return { value: null, date: null };
  }
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {string[]} symbols
 */
function countLive(quotes, symbols) {
  return symbols.filter((s) => {
    const q = quotes[s];
    return q && Number.isFinite(q.pctChange);
  }).length;
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {boolean} positive
 * @param {number} n
 */
function rankMovers(quotes, positive, n = 3) {
  return MOVER_UNIVERSE.map((sym) => ({ sym, pct: quotes[sym]?.pctChange }))
    .filter((r) => r.pct != null && Number.isFinite(r.pct) && (positive ? r.pct > 0 : r.pct < 0))
    .sort((a, b) => (positive ? b.pct - a.pct : a.pct - b.pct))
    .slice(0, n);
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {boolean} positive
 * @param {number} n
 */
function rankSectorEtfs(quotes, positive, n = 3) {
  return SECTOR_ETFS.map(([sym, name]) => ({ sym, name, pct: quotes[sym]?.pctChange }))
    .filter((r) => r.pct != null && Number.isFinite(r.pct) && (positive ? r.pct > 0 : r.pct < 0))
    .sort((a, b) => (positive ? b.pct - a.pct : a.pct - b.pct))
    .slice(0, n);
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {{ value: number|null, date: string|null }} vix
 * @param {BriefingWheelLayer} fallback
 */
function buildTodayLayer(quotes, vix, fallback) {
  const indexSyms = INDEX_SYMBOLS.map(([s]) => s);
  const sectorSyms = SECTOR_ETFS.map(([s]) => s);
  const liveIndices = countLive(quotes, indexSyms);
  const liveSectors = countLive(quotes, sectorSyms);
  const useFallback = liveIndices < 2;

  if (useFallback) {
    return { layer: fallback, provenance: /** @type {BriefingProvenance} */ ("Fallback") };
  }

  const spyPct = quotes.SPY?.pctChange;
  const qqqPct = quotes.QQQ?.pctChange;
  const diaPct = quotes.DIA?.pctChange;
  const sessionTone = toneFromPct(spyPct);
  const sessionWord =
    sessionTone === "up" ? "higher" : sessionTone === "dn" ? "lower" : "mixed";

  const indexSectors = INDEX_SYMBOLS.map(([sym, name]) => ({
    name,
    move: fmtPct(quotes[sym]?.pctChange),
    tone: toneFromPct(quotes[sym]?.pctChange),
  }));

  const vixMove =
    vix.value != null
      ? `${vix.value.toFixed(2)}${vix.date ? ` · ${vix.date}` : ""}`
      : "—";

  indexSectors.push({
    name: "VIX",
    move: vixMove,
    tone: "flat",
  });

  const sectorRows = SECTOR_ETFS.map(([sym, name]) => ({
    sym,
    name,
    pct: quotes[sym]?.pctChange,
  }))
    .filter((r) => r.pct != null && Number.isFinite(r.pct))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 4)
    .map((r) => ({
      name: r.name,
      move: fmtPct(r.pct),
      tone: toneFromPct(r.pct),
    }));

  const topMovers = rankMovers(quotes, true, 3);
  const stocks =
    topMovers.length >= 2
      ? topMovers.map((r) => stockRow(r.sym, quotes))
      : fallback.stocks;

  const topSector = sectorRows[0];
  const headline = `The market closed ${sessionWord} with ${fmtPct(spyPct)} on the S&P 500`;
  const explanation = `The S&P 500 finished ${fmtPct(spyPct)} (${sessionWord} session). Nasdaq 100 ${fmtPct(qqqPct)} and Dow ${fmtPct(diaPct)}. ${
    topSector ? `${topSector.name} led sector ETFs at ${topSector.move}.` : ""
  } ${
    topMovers.length
      ? `Standout gainers included ${topMovers.map((r) => r.sym).join(", ")}.`
      : ""
  }`.trim();

  const reactionParts = [
    vix.value != null ? `VIX ${vix.value.toFixed(2)} (FRED)` : null,
    `SPY ${fmtPct(spyPct)} · QQQ ${fmtPct(qqqPct)}`,
    liveSectors >= 3 ? "Sector ETF moves from live quotes" : null,
  ].filter(Boolean);

  const provenance =
    liveSectors >= 2 && topMovers.length >= 2
      ? /** @type {BriefingProvenance} */ ("Live")
      : /** @type {BriefingProvenance} */ ("Mixed");

  return {
    provenance,
    layer: makeLayer({
      layer: "Today",
      headline,
      explanation,
      why: fallback.whyItMatters,
      sectors: [...indexSectors, ...sectorRows].slice(0, 6),
      stocks,
      reaction: reactionParts.join(" · ") || fallback.reaction,
      watch: fallback.watchNext,
      dive: "Briefing · Today",
    }),
  };
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {BriefingWheelLayer} fallback
 * @param {boolean} positive
 */
function buildMoversLayer(quotes, fallback, positive) {
  const ranked = rankMovers(quotes, positive, 3);
  const sectorRanked = rankSectorEtfs(quotes, positive, 3);
  const useFallback = ranked.length < 2;

  if (useFallback) {
    return { layer: fallback, provenance: /** @type {BriefingProvenance} */ ("Fallback") };
  }

  const label = positive ? "Winners" : "Losers";
  const verbs = positive
    ? { headline: "led the upside", why: "Winners show where risk appetite concentrated today." }
    : {
        headline: "absorbed the heaviest selling",
        why: "Losers show what investors sold even when the index held up.",
      };

  const syms = ranked.map((r) => r.sym);
  const pctSpan = ranked.map((r) => `${r.sym} ${fmtPct(r.pct)}`).join(", ");
  const headline = `${syms.join(", ")} ${verbs.headline}`;
  const explanation = `${pctSpan}—live quotes from the movers universe. ${
    sectorRanked.length
      ? `Sector read-through: ${sectorRanked.map((r) => `${r.name} ${fmtPct(r.pct)}`).join(" · ")}.`
      : ""
  }`;

  const sectors =
    sectorRanked.length >= 2
      ? sectorRanked.map((r) => ({
          name: r.name,
          move: fmtPct(r.pct),
          tone: toneFromPct(r.pct),
        }))
      : fallback.sectors;

  return {
    provenance: sectorRanked.length >= 1 ? "Live" : "Mixed",
    layer: makeLayer({
      layer: label,
      headline,
      explanation,
      why: verbs.why,
      sectors,
      stocks: ranked.map((r) => stockRow(r.sym, quotes)),
      reaction: fallback.reaction,
      watch: fallback.watchNext,
      dive: `Briefing · ${label}`,
    }),
  };
}

/**
 * @returns {Promise<{ config: BriefingWheelConfig, provenance: BriefingProvenance, segmentProvenance: Record<string, BriefingProvenance>, provenanceNotes: string }>}
 */
export async function buildBriefingWheelConfig() {
  console.log("[briefing-preview] briefing builder start");
  const staticConfig = BRIEFING_WHEEL;
  const staticLayers = staticConfig.layers;

  const quoteSymbols = [
    ...INDEX_SYMBOLS.map(([s]) => s),
    ...SECTOR_ETFS.map(([s]) => s),
    ...MOVER_QUOTE_UNIVERSE,
  ];

  let quotes = {};
  let fetchError = null;
  try {
    quotes = await fetchLiveQuotes(quoteSymbols);
  } catch (e) {
    fetchError = e;
    quotes = {};
  }

  const vix = await fetchFredVix();

  const todayResult = buildTodayLayer(quotes, vix, staticLayers.today);
  const winnersResult = buildMoversLayer(quotes, staticLayers.winners, true);
  const losersResult = buildMoversLayer(quotes, staticLayers.losers, false);

  /** @type {Record<string, BriefingProvenance>} */
  const segmentProvenance = {
    today: todayResult.provenance,
    winners: winnersResult.provenance,
    losers: losersResult.provenance,
    why: "Fallback",
    next: "Fallback",
  };

  const liveQuoteCount = Object.keys(quotes).filter(
    (k) => quotes[k]?.price && Number.isFinite(quotes[k].pctChange)
  ).length;

  const pulseHeadline =
    todayResult.provenance === "Live" && quotes.SPY?.pctChange != null
      ? `Session briefing · SPY ${fmtPct(quotes.SPY.pctChange)} · QQQ ${fmtPct(quotes.QQQ?.pctChange)} · live quotes`
      : staticConfig.pulseHeadline;

  /** @type {BriefingWheelConfig} */
  const config = {
    id: staticConfig.id,
    layout: staticConfig.layout,
    flagship: staticConfig.flagship,
    title: staticConfig.title,
    subtitle: staticConfig.subtitle,
    pulseTag: staticConfig.pulseTag,
    pulseHeadline,
    sections: staticConfig.sections,
    layers: {
      today: todayResult.layer,
      winners: winnersResult.layer,
      losers: losersResult.layer,
      why: staticLayers.why,
      next: staticLayers.next,
    },
    provenance: /** @type {BriefingProvenance} */ ("Mixed"),
    segmentProvenance,
    provenanceNotes: `Phase 1 · ${liveQuoteCount} live symbols · why/next static · ${
      fetchError ? String(fetchError.message || fetchError) : "ok"
    }`,
  };

  if (todayResult.provenance === "Fallback" && winnersResult.provenance === "Fallback" && losersResult.provenance === "Fallback") {
    config.provenance = "Fallback";
    config.layers = { ...staticLayers };
    config.pulseHeadline = staticConfig.pulseHeadline;
    config.provenanceNotes = "All live sources failed — full static BRIEFING_WHEEL";
  } else if (
    todayResult.provenance === "Live" &&
    winnersResult.provenance === "Live" &&
    losersResult.provenance === "Live"
  ) {
    config.provenance = "Live";
    config.provenanceNotes = `Phase 1 live · ${liveQuoteCount} symbols · why/next still static fallback`;
  } else {
    config.provenance = "Mixed";
  }

  const result = {
    config,
    provenance: config.provenance,
    segmentProvenance,
    provenanceNotes: config.provenanceNotes || "",
  };
  console.log("[briefing-preview] briefing builder complete", {
    provenance: result.provenance,
    sections: config.sections?.length,
    layers: Object.keys(config.layers || {}),
  });
  return result;
}
