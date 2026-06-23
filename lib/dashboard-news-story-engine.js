/**
 * Deterministic Dashboard News story scoring — no LLM.
 * @module lib/dashboard-news-story-engine
 */

import { clamp } from "/lib/market-risk-engine.js";
import { buildStoryEvidenceRows } from "/lib/dashboard-news-evidence-chart.js";
import {
  STORY_REGISTRY,
  STORY_REGISTRY_BY_ID,
  STORY_SHORT_LABEL,
} from "/lib/dashboard-news-story-registry.js";

const STATUS_DELTA_THRESHOLD = 5;
const WEAK_STRENGTH_THRESHOLD = 25;

/** @typedef {{ dateIso: string, event: string, type: string, source: string }} WatchingCard */

/**
 * Decode HTML entities and strip tags for plain-English display.
 * @param {string} s
 */
export function cleanDisplayText(s) {
  let text = String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Plain-English bullet for long wire headlines (Reuters, etc.).
 * @param {string} text
 * @param {number} [maxLen]
 */
export function formatNewsBullet(text, maxLen = 72) {
  const clean = cleanDisplayText(text);
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 44 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

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
 * @param {string} headline
 */
export function headlineToShortTitle(headline) {
  const clean = String(headline || "").trim();
  if (!clean) return "Market story";
  if (clean.length <= 42) return clean;
  const slice = clean.slice(0, 42);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 24 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

/**
 * @param {WatchingCard} card
 */
export function formatWatchingEvent(card) {
  if (!card?.dateIso || !card?.event) return "";
  const d = new Date(`${card.dateIso}T12:00:00`);
  const day = Number.isNaN(d.getTime())
    ? card.dateIso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let event = String(card.event).trim();
  if (card.type === "Earnings") {
    const sym = event.split(/\s+/)[0];
    event = `${sym} earnings`;
  } else if (event.length > 48) {
    event = event.slice(0, 48).trim() + "…";
  }
  return `${event} on ${day}`;
}

/** @type {Record<string, (card: WatchingCard) => boolean>} */
const WATCHING_FILTERS = {
  inflation: (card) =>
    ["Inflation", "Central Bank", "Growth", "Consumer", "Labour", "Production"].includes(
      card.type
    ) ||
    /cpi|ppi|fed|fomc|gdp|inflation|rates|payroll|retail sales/i.test(card.event) ||
    (card.type === "Earnings" && /JPM|BAC|WFC|C|GS|MS/i.test(card.event)),
  ai: (card) =>
    card.type === "Earnings" &&
    /NVDA|AMD|AVGO|AAPL|MSFT|META|GOOGL|AMZN|ORCL|CRM|NFLX|TSLA/i.test(card.event),
  europe: (card) =>
    /europe|ecb|eurozone|germany|france|dollar|fx|transatlantic/i.test(
      `${card.event} ${card.type}`
    ),
  energy: (card) =>
    (card.type === "Geopolitical" && /opec|oil|energy/i.test(card.event)) ||
    (card.type === "Earnings" && /XOM|CVX/i.test(card.event)) ||
    /oil|opec|crude|petroleum|energy supply/i.test(card.event),
};

/**
 * @param {string} storyId
 * @param {WatchingCard[]} [calendarCards]
 * @param {number} [limit]
 */
export function buildWhatCouldChangeIt(storyId, calendarCards = [], limit = 3) {
  const filter = WATCHING_FILTERS[storyId];
  if (!filter || !calendarCards.length) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lines = [];
  const seen = new Set();
  const ranked = [...calendarCards]
    .filter((c) => {
      const d = new Date(`${c.dateIso}T12:00:00`);
      return !Number.isNaN(d.getTime()) && d >= today;
    })
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  for (const card of ranked) {
    if (!filter(card)) continue;
    const line = formatWatchingEvent(card);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= limit) break;
  }
  return lines;
}

/**
 * @param {object} ctx
 * @param {string} storyId
 */
function deriveStorySources(ctx, storyId) {
  /** @type {Set<string>} */
  const sources = new Set();
  const { quotes = {}, rates = {}, oil = {}, impactItems = [] } = ctx;
  const entry = STORY_REGISTRY_BY_ID[storyId];
  if (entry?.quoteSymbols?.some((s) => quotes[s]?.pctChange != null)) {
    sources.add("Finnhub");
  }
  if (storyId === "inflation" && rates.dgs10 != null) sources.add("FRED");
  if (storyId === "energy" && oil?.price != null) sources.add("FRED");
  if (storyId === "europe" && quotes.UUP?.pctChange != null) sources.add("Finnhub");
  const newsHits = keywordHeadlines(impactItems, entry?.newsKeywords || []);
  if (newsHits.length) sources.add("Finnhub");
  if (ctx.calendarCards?.length) {
    if (ctx.calendarCards.some((c) => c.source === "FRED")) sources.add("FRED");
    if (ctx.calendarCards.some((c) => c.source === "Finnhub")) sources.add("Finnhub");
  }
  return [...sources].sort();
}

/**
 * @param {number} ms
 */
export function formatUpdatedUtc(ms) {
  try {
    return new Date(ms).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return "—";
  }
}

/**
 * Rule-generated headline from live market inputs.
 * @param {string} storyId
 * @param {object} ctx
 * @param {{ strength: number }} scored
 */
export function generateStoryHeadline(storyId, ctx, scored) {
  const { quotes = {}, rates = {}, oil = {} } = ctx;
  const strength = scored.strength;

  if (storyId === "inflation") {
    const dgs10 = rates.dgs10;
    const ch = rates.dgs10Change;
    const xlk = qPct(quotes, "XLK");
    const xlf = qPct(quotes, "XLF");
    const spy = qPct(quotes, "SPY");
    const xlv = qPct(quotes, "XLV");
    const xlu = qPct(quotes, "XLU");

    if (hasNum(xlv) && hasNum(xlk) && xlv > xlk + 0.3 && hasNum(spy) && spy < -0.2) {
      return "Defensive Stocks Lead The Session";
    }
    if (hasNum(xlf) && hasNum(xlk) && xlf > xlk + 0.15) {
      return "Financials Outperform Growth Stocks";
    }
    if (hasNum(dgs10) && dgs10 >= 4.0 && hasNum(xlk) && xlk < -0.3) {
      return "Technology Under Pressure As Yields Stay Elevated";
    }
    if (hasNum(ch) && ch > 0.005) {
      return "Rising Yields Weigh On Rate-Sensitive Stocks";
    }
    if (hasNum(ch) && ch < -0.005 && hasNum(xlk) && xlk > 0) {
      return "Falling Yields Support Growth Stocks";
    }
    if (hasNum(dgs10) && dgs10 >= 4.0) {
      return "Elevated Rates Keep Inflation In Focus";
    }
    return strength >= 55 ? "Inflation And Rates Drive The Tape" : "Macro Data Shapes Market Tone";
  }

  if (storyId === "ai") {
    const chipAvg = avgPct(quotes, ["NVDA", "AMD", "AVGO"]);
    const xlk = qPct(quotes, "XLK");
    if (hasNum(chipAvg) && chipAvg > 0.4) return "AI Leaders Drive Market Gains";
    if (hasNum(chipAvg) && chipAvg < -0.4) return "AI And Chip Stocks Lead The Decline";
    if (hasNum(xlk) && xlk > 0.3) return "Technology Leads The Market Higher";
    if (hasNum(xlk) && xlk < -0.3) return "Tech Weakness Weighs On Major Indexes";
    return "AI Spending Themes Move Tech Names";
  }

  if (storyId === "europe") {
    const spy = qPct(quotes, "SPY");
    const ewg = qPct(quotes, "EWG");
    if (hasNum(spy) && hasNum(ewg)) {
      const spread = spy - ewg;
      if (spread > 0.2) return "US Markets Outperform Europe";
      if (spread < -0.2) return "Europe Outpaces US Stocks Today";
    }
    const uup = qPct(quotes, "UUP");
    if (hasNum(uup) && uup > 0.3) return "Strong Dollar Widens US-Europe Gap";
    return "Transatlantic Divergence Shapes Flows";
  }

  if (storyId === "energy") {
    const xle = qPct(quotes, "XLE");
    const oilCh = oil?.change;
    if (hasNum(oilCh) && oilCh < -1) return "Energy Weakens As Oil Falls";
    if (hasNum(oilCh) && oilCh > 1) return "Energy Rises As Oil Climbs";
    if (hasNum(oilCh) && Math.abs(oilCh) <= 1 && hasNum(xle) && xle > 0) {
      return "Steady Oil Supports Energy Stocks";
    }
    if (hasNum(xle) && xle < -0.5) return "Energy Stocks Slide With Crude";
    return "Oil Prices Guide Energy Sector";
  }

  return "Markets In Motion";
}

/**
 * @param {string} storyId
 * @param {object} ctx
 * @param {string} headline
 * @param {string[]} whatChangedToday
 */
function generateStoryWhat(storyId, ctx, headline, whatChangedToday) {
  if (whatChangedToday?.length && whatChangedToday[0] !== "Live market data is still loading for this story.") {
    return whatChangedToday[0];
  }
  const { rates = {} } = ctx;
  if (storyId === "inflation" && hasNum(rates.dgs10)) {
    return `Treasury yields near ${rates.dgs10.toFixed(2)}% are shaping sector leadership today.`;
  }
  return headline.endsWith(".") ? headline : `${headline}.`;
}

/**
 * @param {{ live: { strength: number, confidence: string } }} story
 */
export function isStoryVisible(story) {
  const live = story?.live;
  if (!live) return false;
  if (live.strength < WEAK_STRENGTH_THRESHOLD && live.confidence === "low") return false;
  return true;
}

/**
 * @param {Array<{ id: string, live: { strength: number, confidencePct: number, dataCoverage: number } }>} stories
 */
export function rankStoriesByLiveScore(stories) {
  return [...stories].sort((a, b) => {
    const la = a.live;
    const lb = b.live;
    if (lb.strength !== la.strength) return lb.strength - la.strength;
    if (lb.confidencePct !== la.confidencePct) return lb.confidencePct - la.confidencePct;
    return (lb.dataCoverage ?? 0) - (la.dataCoverage ?? 0);
  });
}

/**
 * @param {Array<{ id: string, live: object }>} rankedAll
 */
export function selectVisibleStories(rankedAll) {
  const visible = rankedAll.filter(isStoryVisible);
  if (visible.length) return visible;
  return rankedAll.slice(0, 1);
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
        title: cleanDisplayText(String(item?.[5] || "")),
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
    const formatted = formatNewsBullet(hit.title);
    if (formatted) {
      bullets.push({
        text: formatted,
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
  const headline = generateStoryHeadline(storyId, input, scored);
  const what = generateStoryWhat(storyId, input, headline, whatChangedToday);
  const shortTitle = headlineToShortTitle(headline);
  const whatCouldChangeIt = buildWhatCouldChangeIt(storyId, input.calendarCards || []);
  const sources = deriveStorySources(input, storyId);
  const sourceLabel = sources.length ? `Source: ${sources.join(" + ")}` : "Source: live market data";
  const updatedAtUtc = formatUpdatedUtc(now);
  const evidenceRows = buildStoryEvidenceRows(storyId, input);

  return {
    storyId,
    headline,
    what,
    shortTitle,
    status,
    statusDelta:
      priorStrength == null ? 0 : scored.strength - priorStrength,
    strength: scored.strength,
    strengthPrev: priorStrength ?? null,
    confidence,
    confidencePct,
    dataCoverage,
    updatedAt: now,
    updatedAtUtc,
    updatedAgoLabel: formatUpdatedAgo(now),
    whatChangedToday,
    relatedSectors,
    whatCouldChangeIt,
    sources,
    sourceLabel,
    evidenceRows,
    dataQuality: dataCoverage >= 0.5 ? "live" : dataCoverage > 0 ? "delayed" : "fallback",
    inputsUsed: scored.parts.filter((p) => p.score != null).map((p) => p.key),
    why: entry?.why || "",
  };
}

/**
 * @param {object} input
 * @param {WatchingCard[]} [input.calendarCards]
 */
export function computeDashboardNewsSnapshot(input) {
  const now = input.now ?? Date.now();
  const allStories = STORY_REGISTRY.map((entry) => {
    const live = computeStoryLiveState(input, entry.id);
    return { ...entry, live };
  });

  const rankedAll = rankStoriesByLiveScore(allStories);
  const stories = selectVisibleStories(rankedAll);
  const primaryStoryId = stories[0]?.id || rankedAll[0]?.id || "inflation";

  /** @type {Array<{ storyId: string, shortTitle: string, status: StoryStatus, delta: number, line: string }>} */
  const sinceLastVisit = [];
  if (input.priorSnapshot?.stories) {
    for (const entry of STORY_REGISTRY) {
      const prev = input.priorSnapshot.stories[entry.id];
      const live = allStories.find((s) => s.id === entry.id)?.live;
      if (!prev || !live) continue;
      const delta = live.strength - prev.strength;
      const label = live.shortTitle || STORY_SHORT_LABEL[entry.id] || entry.id;
      let line;
      if (live.status === "strengthening") {
        line = `▲ ${label} strengthened`;
      } else if (live.status === "weakening") {
        line = `▼ ${label} weakened`;
      } else {
        line = `→ ${label} unchanged`;
      }
      sinceLastVisit.push({
        storyId: entry.id,
        shortTitle: label,
        status: live.status,
        delta,
        line,
      });
    }
  }

  const hiddenStoryIds = rankedAll
    .filter((s) => !stories.some((v) => v.id === s.id))
    .map((s) => s.id);

  return {
    generatedAt: now,
    primaryStoryId,
    stories,
    allStories: rankedAll,
    hiddenStoryIds,
    sinceLastVisit,
    marketContext: {
      dgs10: input.rates?.dgs10 ?? null,
      dgs10Change: input.rates?.dgs10Change ?? null,
      vix: input.vix ?? null,
    },
  };
}
