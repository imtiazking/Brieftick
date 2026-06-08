/**
 * Deterministic Dashboard News story scoring — no LLM.
 * @module lib/dashboard-news-story-engine
 */

import { clamp } from "/lib/market-risk-engine.js";
import { STORY_REGISTRY, STORY_REGISTRY_BY_ID } from "/lib/dashboard-news-story-registry.js";

const STATUS_DELTA_THRESHOLD = 5;

/** @typedef {'strengthening' | 'stable' | 'weakening'} StoryStatus */
/** @typedef {'high' | 'medium' | 'low'} StoryConfidence */

/**
 * @param {number | null | undefined} pct
 */
function fmtPct(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * @param {number | null | undefined} v
 */
function hasNum(v) {
  return v != null && !Number.isNaN(v);
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {string} sym
 */
function qPct(quotes, sym) {
  return quotes?.[sym]?.pctChange;
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {string[]} syms
 */
function avgPct(quotes, syms) {
  const vals = syms.map((s) => qPct(quotes, s)).filter(hasNum);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * @param {number} move magnitude 0–1 typical
 */
function moveToScore(move, scale = 12) {
  return clamp(50 + move * scale, 8, 92);
}

/**
 * @param {unknown[]} impactItems
 * @param {string[]} keywords
 */
function keywordHeadlines(impactItems, keywords) {
  if (!Array.isArray(impactItems) || !keywords.length) return [];
  const lower = keywords.map((k) => k.toLowerCase());
  const hits = [];
  for (const item of impactItems) {
    const title = String(item?.[5] || item?.[6] || "")
      .replace(/<[^>]+>/g, " ")
      .toLowerCase();
    const body = String(item?.[6] || "").replace(/<[^>]+>/g, " ").toLowerCase();
    const text = `${title} ${body}`;
    if (lower.some((k) => text.includes(k))) {
      hits.push({
        severity: item?.[2] || "med",
        score: typeof item?.[3] === "number" ? item[3] : 0,
        title: String(item?.[5] || "")
          .replace(/<[^>]+>/g, "")
          .trim(),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * @param {object} ctx
 * @param {string} storyId
 */
function scoreStoryComponents(ctx, storyId) {
  const { quotes = {}, sectors = [], rates = {}, impactItems = [], oil = {} } = ctx;
  const entry = STORY_REGISTRY_BY_ID[storyId];
  const newsHits = keywordHeadlines(impactItems, entry?.newsKeywords || []);
  const newsScore = newsHits.length
    ? clamp(42 + newsHits.length * 12 + (newsHits[0]?.severity === "high" ? 14 : 0), 20, 90)
    : null;

  /** @type {Array<{ key: string, score: number | null, weight: number }>} */
  const parts = [];

  if (storyId === "inflation") {
    const dgs10 = rates.dgs10;
    const ch = rates.dgs10Change;
    let ratesScore = null;
    if (hasNum(dgs10)) {
      ratesScore = clamp(38 + (dgs10 - 3.8) * 18, 12, 88);
      if (hasNum(ch)) ratesScore = clamp(ratesScore + ch * 120, 12, 92);
    }
    const xlf = qPct(quotes, "XLF");
    const xlk = qPct(quotes, "XLK");
    let finScore = null;
    if (hasNum(xlf) && hasNum(xlk)) finScore = moveToScore(xlf - xlk, 14);
    const spy = qPct(quotes, "SPY");
    const macroScore = hasNum(spy) ? moveToScore(-spy, 8) : null;
    parts.push(
      { key: "rates", score: ratesScore, weight: 0.35 },
      { key: "financials", score: finScore, weight: 0.25 },
      { key: "macro", score: macroScore, weight: 0.2 },
      { key: "news", score: newsScore, weight: 0.2 }
    );
  } else if (storyId === "ai") {
    const chipAvg = avgPct(quotes, ["NVDA", "AMD", "AVGO"]);
    const xlk = qPct(quotes, "XLK");
    const soxx = qPct(quotes, "SOXX");
    const qqq = qPct(quotes, "QQQ");
    parts.push(
      { key: "chips", score: hasNum(chipAvg) ? moveToScore(chipAvg, 16) : null, weight: 0.35 },
      { key: "xlk", score: hasNum(xlk) ? moveToScore(xlk, 14) : null, weight: 0.25 },
      { key: "semis", score: hasNum(soxx) ? moveToScore(soxx, 14) : null, weight: 0.2 },
      { key: "qqq", score: hasNum(qqq) ? moveToScore(qqq, 10) : null, weight: 0.1 },
      { key: "news", score: newsScore, weight: 0.1 }
    );
  } else if (storyId === "europe") {
    const spy = qPct(quotes, "SPY");
    const ewg = qPct(quotes, "EWG");
    const uup = qPct(quotes, "UUP");
    let spreadScore = null;
    if (hasNum(spy) && hasNum(ewg)) spreadScore = moveToScore(spy - ewg, 16);
    parts.push(
      { key: "spread", score: spreadScore, weight: 0.4 },
      { key: "dollar", score: hasNum(uup) ? moveToScore(uup, 12) : null, weight: 0.25 },
      { key: "us", score: hasNum(spy) ? moveToScore(spy, 10) : null, weight: 0.15 },
      { key: "news", score: newsScore, weight: 0.2 }
    );
  } else if (storyId === "energy") {
    const xle = qPct(quotes, "XLE");
    const spy = qPct(quotes, "SPY");
    let oilScore = null;
    if (hasNum(oil.change)) oilScore = moveToScore(oil.change * 2, 14);
    else if (hasNum(oil.price)) oilScore = clamp(44 + (oil.price - 70) * 0.35, 20, 80);
    let relScore = null;
    if (hasNum(xle) && hasNum(spy)) relScore = moveToScore(xle - spy, 14);
    parts.push(
      { key: "xle", score: hasNum(xle) ? moveToScore(xle, 14) : null, weight: 0.3 },
      { key: "oil", score: oilScore, weight: 0.35 },
      { key: "relative", score: relScore, weight: 0.2 },
      { key: "news", score: newsScore, weight: 0.15 }
    );
  }

  const valid = parts.filter((p) => p.score != null);
  const weightSum = valid.reduce((s, p) => s + p.weight, 0);
  const strength =
    weightSum > 0
      ? Math.round(valid.reduce((s, p) => s + p.score * p.weight, 0) / weightSum)
      : 50;

  return { strength, parts, newsHits };
}

/**
 * @param {number} strengthNow
 * @param {number | null | undefined} strengthPrev
 * @returns {StoryStatus}
 */
export function deriveStatus(strengthNow, strengthPrev) {
  if (strengthPrev == null || Number.isNaN(strengthPrev)) return "stable";
  const delta = strengthNow - strengthPrev;
  if (delta > STATUS_DELTA_THRESHOLD) return "strengthening";
  if (delta < -STATUS_DELTA_THRESHOLD) return "weakening";
  return "stable";
}

/**
 * @param {Array<{ score: number | null }>} parts
 * @param {StoryStatus} status
 * @param {number} dataCoverage ratio 0–1
 * @returns {{ confidence: StoryConfidence, confidencePct: number }}
 */
export function deriveConfidence(parts, status, dataCoverage) {
  const valid = parts.filter((p) => p.score != null);
  if (!valid.length || dataCoverage < 0.25) {
    return { confidence: "low", confidencePct: 36 };
  }
  const midpoint = 50;
  const bullish = status !== "weakening";
  const aligned = valid.filter((p) =>
    bullish ? p.score >= midpoint : p.score <= midpoint
  ).length;
  const ratio = aligned / valid.length;
  let confidence = "medium";
  let confidencePct = 62;
  if (ratio >= 0.75 && dataCoverage >= 0.6) {
    confidence = "high";
    confidencePct = 84;
  } else if (ratio < 0.5 || dataCoverage < 0.4) {
    confidence = "low";
    confidencePct = 36;
  }
  return { confidence, confidencePct };
}

/**
 * @param {object} ctx
 * @param {string} storyId
 * @param {{ strength?: number, status?: StoryStatus } | null} [prior]
 */
function buildWhatChangedToday(ctx, storyId, scored) {
  const { quotes = {}, sectors = [], rates = {}, oil = {} } = ctx;
  const entry = STORY_REGISTRY_BY_ID[storyId];
  /** @type {Array<{ text: string, rank: number }>} */
  const bullets = [];

  const addSym = (sym, label) => {
    const pct = qPct(quotes, sym);
    const f = fmtPct(pct);
    if (!f) return;
    bullets.push({
      text: `${label || sym} ${f}`,
      rank: Math.abs(pct),
    });
  };

  if (storyId === "inflation") {
    if (hasNum(rates.dgs10)) {
      const ch = rates.dgs10Change;
      const chTxt =
        hasNum(ch) && Math.abs(ch) > 0.0001
          ? ` (${ch >= 0 ? "+" : ""}${Math.round(ch * 100)} bp vs prior)`
          : "";
      const verb = hasNum(ch) ? (ch > 0 ? "rose" : ch < 0 ? "fell" : "held") : "at";
      bullets.push({
        text:
          ch != null && Math.abs(ch) > 0.0001
            ? `10Y Treasury yields ${verb} to ${rates.dgs10.toFixed(2)}%${chTxt}`
            : `10Y Treasury yield at ${rates.dgs10.toFixed(2)}%`,
        rank: hasNum(ch) ? Math.abs(ch) * 1000 : 0.5,
      });
    }
    addSym("XLF", "Financials");
    addSym("XLK", "Technology");
    const xlf = qPct(quotes, "XLF");
    const xlk = qPct(quotes, "XLK");
    if (hasNum(xlf) && hasNum(xlk)) {
      if (xlf > xlk + 0.15) {
        bullets.push({ text: "Financials outperformed growth sectors", rank: xlf - xlk });
      } else if (xlk > xlf + 0.15) {
        bullets.push({ text: "Growth sectors held up vs financials", rank: xlk - xlf });
      }
    }
  } else if (storyId === "ai") {
    addSym("NVDA", "NVDA");
    addSym("AMD", "AMD");
    addSym("AVGO", "AVGO");
    const xlk = sectors.find((s) => s.sym === "XLK") || { pct: qPct(quotes, "XLK") };
    if (hasNum(xlk.pct)) {
      const lead = xlk.pct > 0.2;
      bullets.push({
        text: lead
          ? `Technology sector leading (${fmtPct(xlk.pct)})`
          : `Technology sector ${fmtPct(xlk.pct)}`,
        rank: Math.abs(xlk.pct) + 0.3,
      });
    }
    const chipAvg = avgPct(quotes, ["NVDA", "AMD", "AVGO"]);
    if (hasNum(chipAvg) && chipAvg > 0.4) {
      bullets.push({
        text: "AI-linked chip names are advancing on the tape",
        rank: chipAvg,
      });
    }
  } else if (storyId === "europe") {
    const spy = qPct(quotes, "SPY");
    const ewg = qPct(quotes, "EWG");
    if (hasNum(spy) && hasNum(ewg)) {
      const spread = spy - ewg;
      bullets.push({
        text:
          spread > 0.2
            ? `US equities outpacing Europe (${fmtPct(spy)} vs ${fmtPct(ewg)})`
            : spread < -0.2
              ? `Europe is closing the gap vs US today`
              : `US and Europe moving in tandem today`,
        rank: Math.abs(spread) + 0.4,
      });
    }
    addSym("UUP", "Dollar");
    if (hasNum(qPct(quotes, "UUP")) && qPct(quotes, "UUP") > 0.15) {
      bullets.push({ text: "Dollar strengthened", rank: Math.abs(qPct(quotes, "UUP")) });
    }
  } else if (storyId === "energy") {
    addSym("XLE", "Energy sector");
    if (hasNum(oil.price)) {
      const ch = oil.change;
      bullets.push({
        text: hasNum(ch)
          ? `Oil ${ch >= 0 ? "up" : "down"} on the session (${oil.price.toFixed(2)})`
          : `Oil near ${oil.price.toFixed(2)}`,
        rank: hasNum(ch) ? Math.abs(ch) : 0.4,
      });
    }
    const xle = qPct(quotes, "XLE");
    const spy = qPct(quotes, "SPY");
    if (hasNum(xle) && hasNum(spy) && xle - spy > 0.25) {
      bullets.push({ text: "Energy names leading the broader market", rank: xle - spy });
    }
  }

  for (const hit of scored.newsHits.slice(0, 2)) {
    if (hit.title) {
      bullets.push({
        text: hit.title.length > 88 ? `${hit.title.slice(0, 85)}…` : hit.title,
        rank: hit.score + 0.2,
      });
    }
  }

  bullets.sort((a, b) => b.rank - a.rank);
  const unique = [];
  const seen = new Set();
  for (const b of bullets) {
    const key = b.text.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b.text);
    if (unique.length >= 4) break;
  }

  if (!unique.length) {
    unique.push("Live market data is still loading for this story.");
  }
  return unique;
}

/**
 * @param {string} storyId
 * @param {object} ctx
 */
/** Display mapping — distinct ETF per sector label (readability only). */
const SECTOR_LABEL_ETF = {
  Technology: "XLK",
  Banks: "XLF",
  Energy: "XLE",
  Semiconductors: "SOXX",
  Cloud: "QQQ",
  "Large US companies": "SPY",
  "Currency markets": "UUP",
  Transportation: "XLI",
  "Oil & gas": "XOM",
};

function buildRelatedSectors(storyId, ctx) {
  const entry = STORY_REGISTRY_BY_ID[storyId];
  const { quotes = {}, sectors = [] } = ctx;
  const usedSyms = new Set();
  return entry.impactSectors.map((label, i) => {
    const etf =
      SECTOR_LABEL_ETF[label] ||
      entry.sectorEtfs[i] ||
      entry.sectorEtfs.find((sym) => !usedSyms.has(sym)) ||
      entry.sectorEtfs[0];
    usedSyms.add(etf);
    const fromSector = sectors.find((s) => s.sym === etf);
    const pct = fromSector?.pct ?? qPct(quotes, etf);
    return { label, sym: etf, pct: hasNum(pct) ? pct : null };
  });
}

/**
 * @param {number} ms
 */
export function formatUpdatedAgo(ms) {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hr ago`;
}

/**
 * @param {StoryStatus} status
 */
export function statusLabel(status) {
  if (status === "strengthening") return "Strengthening";
  if (status === "weakening") return "Weakening";
  return "Stable";
}

/**
 * @param {StoryStatus} status
 */
export function statusArrow(status) {
  if (status === "strengthening") return "▲";
  if (status === "weakening") return "▼";
  return "→";
}

/**
 * @param {object} input
 * @param {Record<string, { pctChange?: number, price?: number }>} [input.quotes]
 * @param {Array<{ sym: string, name?: string, pct: number }>} [input.sectors]
 * @param {{ dgs10?: number | null, dgs2?: number | null, dgs10Change?: number | null }} [input.rates]
 * @param {unknown[]} [input.impactItems]
 * @param {{ price?: number | null, change?: number | null }} [input.oil]
 * @param {{ stories?: Record<string, { strength: number, status: StoryStatus }>, savedAt?: number } | null} [input.priorSnapshot]
 * @param {number} [input.now]
 */
export function computeStoryLiveState(input, storyId) {
  const now = input.now ?? Date.now();
  const scored = scoreStoryComponents(input, storyId);
  const priorStrength = input.priorSnapshot?.stories?.[storyId]?.strength;
  const status = deriveStatus(scored.strength, priorStrength);
  const validCount = scored.parts.filter((p) => p.score != null).length;
  const dataCoverage = scored.parts.length ? validCount / scored.parts.length : 0;
  const { confidence, confidencePct } = deriveConfidence(scored.parts, status, dataCoverage);

  const entry = STORY_REGISTRY_BY_ID[storyId];
  const whatChangedToday = buildWhatChangedToday(input, storyId, scored);
  const relatedSectors = buildRelatedSectors(storyId, input);
  const whatCouldChangeIt = [...(entry?.watchingTemplates || [])].slice(0, 3);

  return {
    storyId,
    status,
    statusDelta:
      priorStrength == null ? 0 : scored.strength - priorStrength,
    strength: scored.strength,
    strengthPrev: priorStrength ?? null,
    confidence,
    confidencePct,
    updatedAt: now,
    updatedAgoLabel: formatUpdatedAgo(now),
    whatChangedToday,
    relatedSectors,
    whatCouldChangeIt,
    dataQuality: dataCoverage >= 0.5 ? "live" : dataCoverage > 0 ? "delayed" : "fallback",
    inputsUsed: scored.parts.filter((p) => p.score != null).map((p) => p.key),
  };
}

/**
 * @param {object} input
 */
export function computeDashboardNewsSnapshot(input) {
  const now = input.now ?? Date.now();
  const stories = STORY_REGISTRY.map((entry) => {
    const live = computeStoryLiveState(input, entry.id);
    return { ...entry, live };
  });
  const primaryStoryId =
    STORY_REGISTRY.find((s) => s.primary)?.id || stories[0]?.id || "inflation";

  /** @type {Array<{ storyId: string, shortTitle: string, status: StoryStatus, delta: number, line: string }>} */
  const sinceLastVisit = [];
  if (input.priorSnapshot?.stories) {
    for (const entry of STORY_REGISTRY) {
      const prev = input.priorSnapshot.stories[entry.id];
      const live = stories.find((s) => s.id === entry.id)?.live;
      if (!prev || !live) continue;
      const delta = live.strength - prev.strength;
      let line;
      if (live.status === "strengthening") {
        line = `▲ ${entry.shortTitle} strengthened`;
      } else if (live.status === "weakening") {
        line = `▼ ${entry.shortTitle} weakened`;
      } else {
        line = `→ ${entry.shortTitle} unchanged`;
      }
      sinceLastVisit.push({
        storyId: entry.id,
        shortTitle: entry.shortTitle,
        status: live.status,
        delta,
        line,
      });
    }
  }

  return {
    generatedAt: now,
    primaryStoryId,
    stories,
    sinceLastVisit,
    marketContext: {
      dgs10: input.rates?.dgs10 ?? null,
      dgs10Change: input.rates?.dgs10Change ?? null,
      vix: input.vix ?? null,
    },
  };
}
