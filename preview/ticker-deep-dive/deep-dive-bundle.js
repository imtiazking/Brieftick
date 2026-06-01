/**
 * Fetch live/cached market context for Ticker Deep Dive (Phase A).
 * @module preview/ticker-deep-dive/deep-dive-bundle
 */

import { getTickerMeta } from "./ticker-meta.js";

/** @typedef {'Live Intelligence'|'Cached Data'|'Sector Model'} DeepDiveProvenance */

/**
 * @typedef {Object} DeepDiveQuote
 * @property {number} [price]
 * @property {number} [pctChange]
 * @property {number} [change]
 * @property {string} [provider]
 * @property {boolean} [stale]
 */

/**
 * @typedef {Object} SectorMoveRow
 * @property {string} sym
 * @property {string} label
 * @property {number|null} pct
 */

/**
 * @typedef {Object} EarningsRow
 * @property {string} date
 * @property {number} [daysUntil]
 * @property {string} [hour]
 * @property {number} [epsEstimate]
 */

/**
 * @typedef {Object} DeepDiveBundle
 * @property {string} sym
 * @property {import('./ticker-meta.js').TickerMeta} meta
 * @property {DeepDiveQuote|null} quote
 * @property {{ headline: string, summary?: string, source?: string, datetime?: number }[]} companyNews
 * @property {EarningsRow|null} earnings
 * @property {SectorMoveRow[]} sectorMoves
 * @property {{ vixLabel?: string, regime?: string }} macro
 * @property {DeepDiveProvenance} provenance
 * @property {string[]} failedSources
 * @property {number} fetchedAt
 */

const MACRO_ETFS = [
  ["XLK", "Technology"],
  ["XLF", "Financials"],
  ["XLE", "Energy"],
  ["XLV", "Health Care"],
  ["XLP", "Consumer Staples"],
];

/**
 * @param {import('../../logic/dataFusion.js').FusionBundle} [fusion]
 * @param {string} sym
 * @returns {DeepDiveQuote|null}
 */
function quoteFromFusion(fusion, sym) {
  const key = String(sym).toUpperCase();
  const fq = fusion?.quotes?.[key];
  if (!fq || fq.price == null || fq.pctChange == null) return null;
  const price = Number(fq.price);
  const pctChange = Number(fq.pctChange);
  if (!(price > 0) || !Number.isFinite(pctChange)) return null;
  const change = price * (pctChange / 100) / (1 + pctChange / 100);
  return {
    price,
    pctChange,
    change,
    provider: fq.providers?.join("+") || "Logic",
    stale: !!fq.stale,
  };
}

/**
 * @param {object} q
 * @returns {DeepDiveQuote|null}
 */
function normalizeApiQuote(q) {
  if (!q || !(Number(q.price) > 0)) return null;
  const pctChange = Number(q.pctChange);
  if (!Number.isFinite(pctChange)) return null;
  return {
    price: Number(q.price),
    pctChange,
    change: Number(q.change) || 0,
    provider: q.provider || "Finnhub",
    stale: !!q._stale,
  };
}

/**
 * @param {string} sym
 * @param {object[]} calendar
 * @returns {EarningsRow|null}
 */
function pickEarningsForSymbol(sym, calendar) {
  const key = String(sym).toUpperCase();
  const row = (calendar || []).find(
    (e) => String(e.symbol || e.ticker || "").toUpperCase() === key
  );
  if (!row?.date) return null;
  const dateStr = String(row.date).slice(0, 10);
  const report = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const daysUntil = Math.round((report - now) / 86400000);
  return {
    date: dateStr,
    daysUntil,
    hour: row.hour,
    epsEstimate: row.epsEstimate != null ? Number(row.epsEstimate) : undefined,
  };
}

async function readMacroFromDom() {
  try {
    const vixEl = document.getElementById("vixValue");
    const regimeEl = document.getElementById("riskRegimeLabel");
    return {
      vixLabel: vixEl?.textContent?.trim() || undefined,
      regime: regimeEl?.textContent?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * @param {DeepDiveBundle} partial
 * @returns {DeepDiveProvenance}
 */
function resolveProvenance(partial) {
  const hasLiveQuote =
    partial.quote?.price != null && !partial.quote.stale && partial.quote.provider !== "Preview";
  const hasNews = (partial.companyNews || []).length > 0;
  const hasSector =
    (partial.sectorMoves || []).some((s) => s.pct != null && !Number.isNaN(s.pct));
  const anyStale = partial.quote?.stale;

  if (!hasLiveQuote && !hasNews && !hasSector) return "Sector Model";
  if (anyStale && (hasLiveQuote || hasNews || hasSector)) return "Cached Data";
  if (hasLiveQuote || hasNews || hasSector) return "Live Intelligence";
  return "Sector Model";
}

/**
 * @param {string} sym
 * @param {{
 *   quote?: DeepDiveQuote,
 *   fusion?: import('../../logic/dataFusion.js').FusionBundle,
 * }} [opts]
 * @returns {Promise<DeepDiveBundle>}
 */
export async function fetchDeepDiveBundle(sym, opts = {}) {
  const key = String(sym || "NVDA").toUpperCase();
  const meta = getTickerMeta(key);
  const failedSources = [];
  /** @type {DeepDiveQuote|null} */
  let quote = normalizeApiQuote(opts.quote) || quoteFromFusion(opts.fusion, key);
  /** @type {{ headline: string, summary?: string, source?: string, datetime?: number }[]} */
  let companyNews = [];
  /** @type {EarningsRow|null} */
  let earnings = null;
  /** @type {SectorMoveRow[]} */
  let sectorMoves = [];

  const api = typeof window !== "undefined" ? window.BriefTickAPI : null;
  const macro = await readMacroFromDom();

  if (opts.fusion?.sectorMoves?.length) {
    sectorMoves = opts.fusion.sectorMoves.map((r) => ({
      sym: r.sym,
      label: r.label,
      pct: r.pct ?? null,
    }));
  }

  const tasks = [];

  if (!quote && api?.getQuote) {
    tasks.push(
      (async () => {
        try {
          const q = await api.getQuote(key);
          quote = normalizeApiQuote(q);
          if (!quote) failedSources.push("quote:empty");
        } catch (e) {
          failedSources.push(`quote:${e.message || "error"}`);
        }
      })()
    );
  }

  if (api?.getCompanyNews) {
    tasks.push(
      (async () => {
        try {
          const news = await api.getCompanyNews(key, 7);
          companyNews = (news || []).slice(0, 5);
          if (!companyNews.length) failedSources.push("company-news:empty");
        } catch (e) {
          failedSources.push(`company-news:${e.message || "error"}`);
        }
      })()
    );
  } else {
    failedSources.push("company-news:no_api");
  }

  if (api?.getEarningsCalendar) {
    tasks.push(
      (async () => {
        try {
          const cal = await api.getEarningsCalendar();
          earnings = pickEarningsForSymbol(key, cal);
        } catch (e) {
          failedSources.push(`earnings:${e.message || "error"}`);
        }
      })()
    );
  }

  if (!sectorMoves.length && api?.getQuote) {
    tasks.push(
      (async () => {
        const rows = [];
        const symbols = [...new Set([meta.sectorEtf, ...MACRO_ETFS.map((r) => r[0])])];
        for (const etfSym of symbols) {
          const label =
            etfSym === meta.sectorEtf
              ? meta.sectorLabel
              : MACRO_ETFS.find((r) => r[0] === etfSym)?.[1] || etfSym;
          try {
            const q = await api.getQuote(etfSym);
            const pct = q?.pctChange != null ? Number(q.pctChange) : null;
            rows.push({ sym: etfSym, label, pct: Number.isFinite(pct) ? pct : null });
          } catch {
            failedSources.push(`sector:${etfSym}`);
          }
        }
        sectorMoves = rows.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
      })()
    );
  }

  await Promise.all(tasks);

  const primarySector =
    sectorMoves.find((r) => r.sym === meta.sectorEtf) || sectorMoves[0] || null;

  const bundle = {
    sym: key,
    meta,
    quote,
    companyNews,
    earnings,
    sectorMoves,
    primarySector,
    macro,
    provenance: "Sector Model",
    failedSources,
    fetchedAt: Date.now(),
  };

  bundle.provenance = resolveProvenance(bundle);
  return bundle;
}
