/**
 * Live What Matters calendar — FRED macro releases + Finnhub earnings + high-signal news.
 * @module lib/what-matters-feed
 */

/** @typedef {'high' | 'medium' | 'low'} WhatMattersImportance */

/**
 * @typedef {object} WhatMattersCard
 * @property {string} id
 * @property {string} dateIso
 * @property {string} dateLabel
 * @property {string} event
 * @property {string} type
 * @property {string} why
 * @property {string[]} impact
 * @property {WhatMattersImportance} importance
 * @property {string} source
 * @property {string} explain
 */

const MEGA_CAP_SYMBOLS = new Set([
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AMD",
  "AVGO",
  "JPM",
  "NFLX",
  "ORCL",
  "CRM",
  "BAC",
  "UNH",
  "LLY",
]);

/** @type {Map<number, { type: string, why: string, impact: string[], importance: WhatMattersImportance, explain: string }>} */
const FRED_RELEASE_META = new Map([
  [
    10,
    {
      type: "Inflation",
      why: "CPI shows how fast consumer prices are rising — a primary input for Fed rate expectations.",
      impact: ["Technology", "Bonds", "US Dollar"],
      importance: "high",
      explain:
        "A hotter-than-expected CPI can push yields higher and pressure rate-sensitive growth stocks. A cooler print can ease financial conditions and support equities.",
    },
  ],
  [
    50,
    {
      type: "Labour",
      why: "Payrolls and unemployment shape the growth-inflation mix the Fed is trying to balance.",
      impact: ["Broad equities", "Bonds", "US Dollar"],
      importance: "high",
      explain:
        "Strong jobs data can keep the Fed cautious on cuts; weak data can revive recession fears. Both paths move rates and sector leadership quickly.",
    },
  ],
  [
    53,
    {
      type: "Growth",
      why: "GDP sets the baseline for corporate earnings and how much slack remains in the economy.",
      impact: ["Broad equities", "Cyclicals", "Bonds"],
      importance: "medium",
      explain:
        "Revisions to growth can shift recession odds and the earnings outlook for cyclical versus defensive sectors.",
    },
  ],
  [
    101,
    {
      type: "Consumer",
      why: "Retail sales reveal whether consumers are still spending — a key driver of US growth.",
      impact: ["Consumer Discretionary", "Retail", "Bonds"],
      importance: "medium",
      explain:
        "Soft spending can weigh on retailers and growth forecasts; resilient sales support cyclicals and risk appetite.",
    },
  ],
  [
    180,
    {
      type: "Inflation",
      why: "Producer prices lead consumer inflation and margin pressure across the supply chain.",
      impact: ["Industrials", "Materials", "Bonds"],
      importance: "medium",
      explain:
        "Higher PPI can signal building pipeline inflation; lower PPI can ease margin fears for manufacturers.",
    },
  ],
  [
    194,
    {
      type: "Central Bank",
      why: "FOMC communications reset the rate path and liquidity expectations for all risk assets.",
      impact: ["Interest Rates", "Banks", "Technology"],
      importance: "high",
      explain:
        "Markets parse every word for timing of cuts or hikes. Front-end yields and mega-cap growth often react first.",
    },
  ],
  [
    206,
    {
      type: "Production",
      why: "Industrial output signals manufacturing momentum and cyclical demand.",
      impact: ["Industrials", "Materials", "Energy"],
      importance: "medium",
      explain:
        "Weak production can flag slowing cyclical demand; strength supports industrials and commodity-sensitive names.",
    },
  ],
]);

const SIGNAL_KEYWORDS = {
  centralbank:
    /(fed\b|federal reserve|powell|fomc|ecb|lagarde|boe|boj|central bank|rate decision|basis point|inflation target)/i,
  macro:
    /(cpi|gdp|nfarm|jobs report|payrolls|pce|retail sales|pmi|ism|consumer confidence|trade deficit|treasury yield)/i,
  regulatory: /(sec\b|doj\b|antitrust|ftc\b|regulation|probe|fine|sanctions|tariff|trade war)/i,
  geopolitical: /(opec|war|conflict|sanctions|geopolitical|supply chain|export ban|energy crisis)/i,
};

/**
 * @param {string} iso
 */
export function formatWhatMattersDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * @param {string} refreshedAtIso
 */
export function formatRefreshedAt(refreshedAtIso) {
  try {
    const d = new Date(refreshedAtIso);
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * @param {WhatMattersImportance} imp
 */
function importanceRank(imp) {
  if (imp === "high") return 3;
  if (imp === "medium") return 2;
  return 1;
}

/**
 * @param {string | undefined} imp
 * @returns {WhatMattersImportance}
 */
function normalizeImportance(imp) {
  if (imp === "high") return "high";
  if (imp === "low") return "low";
  return "medium";
}

/**
 * @param {string} text
 */
function classifySignal(text) {
  for (const [kind, re] of Object.entries(SIGNAL_KEYWORDS)) {
    if (re.test(text)) {
      const labels = {
        centralbank: "Central Bank",
        macro: "Macro Data",
        regulatory: "Regulatory",
        geopolitical: "Geopolitical",
      };
      return labels[kind] || "Market News";
    }
  }
  return null;
}

/**
 * @param {Response} res
 */
async function fetchJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<WhatMattersCard[]>}
 */
async function fetchFredCards() {
  const res = await fetch("/api/proxy?provider=fred&endpoint=calendar");
  if (!res.ok) return [];
  const data = await fetchJson(res);
  const events = data?.events || [];
  const seen = new Set();
  /** @type {WhatMattersCard[]} */
  const cards = [];

  for (const row of events) {
    const releaseId = row.releaseId;
    const meta = FRED_RELEASE_META.get(releaseId);
    if (!meta || !row.when) continue;
    const key = `fred:${row.when}:${releaseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const eventName = row.ev || "US economic release";
    cards.push({
      id: key,
      dateIso: row.when,
      dateLabel: formatWhatMattersDate(row.when),
      event: eventName,
      type: meta.type,
      why: meta.why,
      impact: meta.impact,
      importance: row.imp === "high" ? "high" : normalizeImportance(meta.importance),
      source: "FRED",
      explain: meta.explain,
    });
  }
  return cards;
}

/**
 * @returns {Promise<WhatMattersCard[]>}
 */
async function fetchEarningsCards() {
  const today = new Date();
  const end = new Date(today.getTime() + 21 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const from = fmt(today);
  const to = fmt(end);
  const res = await fetch(
    `/api/proxy?provider=finnhub&endpoint=calendar/earnings&from=${from}&to=${to}`
  );
  if (!res.ok) return [];
  const data = await fetchJson(res);
  const rows = data?.earningsCalendar || [];
  /** @type {WhatMattersCard[]} */
  const cards = [];

  for (const row of rows) {
    if (!row?.symbol || !row?.date || !MEGA_CAP_SYMBOLS.has(row.symbol)) continue;
    const hour =
      row.hour === "bmo"
        ? " (before market open)"
        : row.hour === "amc"
          ? " (after market close)"
          : "";
    const qLabel = row.quarter && row.year ? ` Q${row.quarter} ${row.year}` : "";
    cards.push({
      id: `earn:${row.symbol}:${row.date}`,
      dateIso: row.date,
      dateLabel: formatWhatMattersDate(row.date) + hour,
      event: `${row.symbol}${qLabel} earnings`,
      type: "Earnings",
      why: "Mega-cap earnings reset sector growth expectations and often move index leadership.",
      impact: ["Technology", "Index ETFs", row.symbol],
      importance: "high",
      source: "Finnhub",
      explain:
        "Guidance and margin commentary from large-cap reporters can shift the tape even when macro data is quiet.",
    });
  }
  return cards;
}

/**
 * @returns {Promise<WhatMattersCard[]>}
 */
async function fetchNewsCards() {
  const api = typeof window !== "undefined" ? window.BriefTickAPI : null;
  if (!api?.getMarketNews) return [];

  let news = [];
  try {
    news = await api.getMarketNews("general");
  } catch {
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxAge = 2 * 86400000;
  /** @type {WhatMattersCard[]} */
  const cards = [];

  for (const n of news.slice(0, 20)) {
    const text = `${n.headline || ""} ${n.summary || ""}`;
    const type = classifySignal(text);
    if (!type || !n.headline) continue;
    const unix = n.datetime || 0;
    const pub = new Date(unix * 1000);
    if (Number.isNaN(pub.getTime())) continue;
    if (today.getTime() - pub.getTime() > maxAge) continue;
    const dateIso = pub.toISOString().slice(0, 10);
    cards.push({
      id: `news:${unix}:${(n.headline || "").slice(0, 40)}`,
      dateIso,
      dateLabel: formatWhatMattersDate(dateIso),
      event: String(n.headline).slice(0, 120),
      type,
      why: "High-signal headlines can move rates, FX, and sector leadership intraday.",
      impact: ["Broad equities", "Rates", "FX"],
      importance: type === "Central Bank" || type === "Macro Data" ? "high" : "medium",
      source: "Finnhub",
      explain: n.summary
        ? String(n.summary).slice(0, 280)
        : "Live market headline classified as macro-relevant.",
    });
    if (cards.length >= 2) break;
  }
  return cards;
}

/**
 * @param {WhatMattersCard[]} cards
 */
function rankCards(cards) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [...cards]
    .filter((c) => {
      const d = new Date(`${c.dateIso}T12:00:00`);
      return !Number.isNaN(d.getTime()) && d >= today;
    })
    .sort((a, b) => {
      const dateCmp = a.dateIso.localeCompare(b.dateIso);
      if (dateCmp !== 0) return dateCmp;
      return importanceRank(b.importance) - importanceRank(a.importance);
    });
}

/**
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ cards: WhatMattersCard[], refreshedAt: string, empty: boolean }>}
 */
export async function fetchWhatMattersFeed(opts = {}) {
  const limit = opts.limit ?? 5;
  const refreshedAt = new Date().toISOString();

  const [fred, earnings, news] = await Promise.all([
    fetchFredCards(),
    fetchEarningsCards(),
    fetchNewsCards(),
  ]);

  const merged = rankCards([...fred, ...earnings, ...news]);
  const deduped = [];
  const seen = new Set();
  for (const card of merged) {
    const key = `${card.source}:${card.dateIso}:${card.event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(card);
    if (deduped.length >= limit) break;
  }

  return {
    cards: deduped,
    refreshedAt,
    empty: deduped.length === 0,
  };
}
