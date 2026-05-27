/**
 * Ticker voice variation — type-specific phrasing, varied rhythm, session de-duplication.
 * @module logic/engines/tickerVoiceVariation
 */

import { getTickerDisplayName } from "./tickerCatalog.js";
import { isSymbolSpecificHeadline } from "./tickerDeskCopy.js";
/**
 * @param {string} text
 * @param {number} max
 */
function limitSentences(text, max) {
  const s = String(text || "").trim();
  if (!s || max < 1) return "";
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  if (parts.length <= max) return s;
  return parts.slice(0, max).join(" ").trim();
}

/** @typedef {'mega_cap_tech'|'semi_ai'|'memory_semis'|'legacy_semi'|'cloud_software'|'telecom'|'ev_high_beta'|'bank_financial'|'gold_hedge'|'energy'|'defensive_staples'|'index_etf'|'general'} TickerVoiceType */

const SEMIS_AI = new Set(["NVDA", "AMD", "AVGO", "ASML", "TSM", "ARM", "SMCI", "SOX", "SMH", "LRCX"]);
const SEMI_EQUIPMENT = new Set(["LRCX"]);
const MEMORY_SEMIS = new Set(["MU"]);
const LEGACY_SEMIS = new Set(["INTC"]);
const CLOUD_SOFTWARE = new Set(["SNOW", "CRM", "ORCL"]);
const TELECOM = new Set(["NOK", "VZ", "T"]);
const MEGA_TECH = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "ORCL", "CRM", "COST",
]);
const EV_HIGH_BETA = new Set(["TSLA", "RIVN", "COIN", "PLTR", "ARKK", "UBER"]);
const BANKS = new Set(["JPM", "GS", "BAC", "WFC", "C", "MS", "XLF"]);
const PRECIOUS = new Set(["GLD", "SLV", "GDX"]);
const ENERGY = new Set(["XOM", "CVX", "USO", "UNG", "XLE", "COP", "OXY"]);
const DEFENSIVE = new Set([
  "JNJ", "PG", "KO", "PEP", "WMT", "MRK", "UNH", "XLP", "XLV", "VZ", "T",
]);
const INDICES = new Set(["SPY", "QQQ", "DIA", "IWM", "SPX", "NDX"]);

/** Patterns we rotate away from when overused in-session. */
const TEMPLATE_PATTERN_RE =
  /is moving with|broader sentiment today|no clear company-specific catalyst|rather than a (?:single|stock-specific) headline|with no single company-specific|dominating the (?:session|move)/i;

const SESSION_MAX = 10;

/**
 * @returns {string[]}
 */
function getSessionPatterns() {
  if (typeof window !== "undefined") {
    if (!Array.isArray(window.__logicTickerVoicePatterns)) {
      window.__logicTickerVoicePatterns = [];
    }
    return window.__logicTickerVoicePatterns;
  }
  if (!globalThis.__logicTickerVoicePatterns) {
    globalThis.__logicTickerVoicePatterns = [];
  }
  return globalThis.__logicTickerVoicePatterns;
}

/**
 * @param {string} key
 */
function rememberPattern(key) {
  const list = getSessionPatterns();
  list.push(key);
  while (list.length > SESSION_MAX) list.shift();
}

/**
 * @param {string} text
 * @param {string} symbol
 * @param {string} name
 */
export function tickerAnswerStructureKey(text, symbol, name) {
  let s = String(text || "").toLowerCase();
  s = s.replace(new RegExp(String(symbol || "").toLowerCase(), "gi"), "");
  s = s.replace(new RegExp(String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  s = s.replace(/[-+]?\d+\.?\d*%/g, "#");
  s = s.replace(/\b(today|session|move|stock|name|company)\b/g, "");
  s = s.replace(/[^a-z\s]/g, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, 72);
}

/**
 * @param {string} symbol
 * @returns {TickerVoiceType}
 */
export function classifyTickerVoiceType(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (EV_HIGH_BETA.has(s)) return "ev_high_beta";
  if (CLOUD_SOFTWARE.has(s)) return "cloud_software";
  if (TELECOM.has(s)) return "telecom";
  if (MEMORY_SEMIS.has(s)) return "memory_semis";
  if (LEGACY_SEMIS.has(s)) return "legacy_semi";
  if (SEMI_EQUIPMENT.has(s)) return "semi_ai";
  if (SEMIS_AI.has(s)) return "semi_ai";
  if (MEGA_TECH.has(s)) return "mega_cap_tech";
  if (BANKS.has(s)) return "bank_financial";
  if (PRECIOUS.has(s)) return "gold_hedge";
  if (ENERGY.has(s)) return "energy";
  if (DEFENSIVE.has(s)) return "defensive_staples";
  if (INDICES.has(s)) return "index_etf";
  return "general";
}

/**
 * @param {string} text
 */
export function looksLikeTickerTemplate(text) {
  return TEMPLATE_PATTERN_RE.test(String(text || ""));
}

/**
 * @param {{ pctChange?: number }|null|undefined} quote
 */
function sessionDirection(quote) {
  if (!quote || typeof quote.pctChange !== "number") return "mixed";
  if (quote.pctChange >= 0.35) return "up";
  if (quote.pctChange <= -0.35) return "down";
  return "flat";
}

/**
 * @param {TickerVoiceType} type
 * @param {string} symbol
 * @param {{ name: string, symbol: string, quote?: { pctChange?: number }|null, headline?: string, hook?: string }} ctx
 */
function variantsForType(type, symbol, ctx) {
  const { name, quote } = ctx;
  const dir = sessionDirection(quote);
  const easing = dir === "down" ? "easing" : dir === "up" ? "firming" : "trading";

  /** @type {Record<TickerVoiceType, (() => string)[]>} */
  const pools = {
    ev_high_beta: [
      () =>
        `Tesla looks more tied to broader growth sentiment today than any specific company catalyst, with high-beta tech still sensitive to rates and risk appetite.`,
      () =>
        `${name} is acting like a growth-risk name — appetite for beta and rates are doing more of the work than a fresh headline.`,
      () =>
        `${name}'s session ${dir === "down" ? "softness" : dir === "up" ? "bid" : "tone"} lines up with high-beta peers; nothing company-specific is standing out.`,
      () =>
        `For ${name}, the tape reads macro-led: EV and growth beta are moving together without a dedicated catalyst.`,
    ],
    cloud_software: [
      () =>
        `${name} is trading with cloud and data-infrastructure software tone — the group matters more than a lone headline.`,
      () =>
        `For ${name}, enterprise software sentiment is in charge; nothing name-specific is dominating the session.`,
      () =>
        `${name} looks more like a cloud-software batch move than a Snowflake-specific catalyst.`,
    ],
    telecom: [
      () =>
        `${name} is moving with telecom and network-equipment tone rather than a dedicated company headline.`,
      () =>
        `For ${name}, the read is sector-linked — carriers and network names are moving together.`,
      () =>
        `${name} fits the telecom infrastructure bucket today; no standalone catalyst is obvious.`,
    ],
    memory_semis: [
      () =>
        `${name} is tracking memory-chip sentiment — DRAM/NAND tone is louder than a one-off headline.`,
      () =>
        `Memory semis are setting the pace for ${name}; the group move is the cleaner story.`,
      () =>
        `${name} is ${easing} with memory peers; company-specific news is not leading.`,
    ],
    legacy_semi: [
      () =>
        `${name} is moving with legacy semiconductor and CPU tone — foundry and PC demand matter more than a single headline.`,
      () =>
        `For ${name}, the old-line semi complex is in focus; idiosyncratic news is not dominating.`,
      () =>
        `${name} is tracking Intel/CPU peer tone rather than a standalone catalyst.`,
    ],
    semi_ai: [
      () =>
        `Nvidia is easing alongside semiconductors and AI-linked names after recent strength, with no major standalone headline driving the move.`,
      () =>
        `${name} is ${easing} with the chip and AI complex — the group move matters more than a one-off headline right now.`,
      () =>
        `Semis and AI hardware are setting the tone for ${name}; company-specific news is not the main driver on this print.`,
      () =>
        `${name} is tracking peer semiconductors more than its own story — typical when the sector batch moves together.`,
    ],
    mega_cap_tech: [
      () =>
        `${name}'s move appears more connected to broader mega-cap positioning and market tone than company-specific news.`,
      () =>
        `${name} is trading more on mega-cap tech positioning than a dedicated headline — breadth and risk tone matter here.`,
      () =>
        `For ${name}, mega-cap tech tone is doing the lifting; there is little sign of a standalone company driver.`,
    ],
    bank_financial: [
      () =>
        `Banks are trading more off yields and rate expectations today, pulling JPM with the broader financial sector.`,
      () =>
        `Banks are trading more off yields and rate expectations today, pulling ${name} with the broader financial sector.`,
      () =>
        `${name} is following the financials group — yield moves and rate-path repricing are the main channel.`,
      () =>
        `The read on ${name} is sector-first: lenders are moving with rates, not a single bank headline.`,
    ],
    gold_hedge: [
      () =>
        `Gold is reacting primarily to real-yield expectations and dollar positioning rather than a single macro headline.`,
      () =>
        `${name} is reacting primarily to real-yield expectations and dollar positioning rather than a single macro headline.`,
      () =>
        `For ${name}, real yields and the dollar are the story — not one discrete macro headline.`,
      () =>
        `${name} is trading as a rates-and-FX hedge today; the metal complex is moving on positioning, not a shock headline.`,
    ],
    energy: [
      () =>
        `Energy names are moving with oil and inflation-risk sentiment rather than a stock-specific catalyst.`,
      () =>
        `${name} is following crude and the wider energy tape more than a dedicated company headline.`,
      () =>
        `Oil and inflation-risk tone are dragging the energy complex — ${name} is in that bucket today.`,
      () =>
        `For ${name}, the oil and macro-inflation read matters more than idiosyncratic news on the name.`,
    ],
    defensive_staples: [
      () =>
        `${name} is holding a quieter tone — defensives often lag risk-on days when the tape is macro-led.`,
      () =>
        `${name} looks more like a stability bid than a catalyst story; staples tone is subdued versus the beta names.`,
      () =>
        `Defensive positioning is muted for ${name} — the session is macro-driven, not name-specific.`,
    ],
    index_etf: [
      () =>
        `${name} is tracking index tone — breadth and risk appetite matter more than any single holding.`,
      () =>
        `For ${name}, factor and macro tone are in charge; there is no single-stock catalyst in an ETF read.`,
      () =>
        `${name} is moving with the benchmark — index-level risk on/off is the cleaner explanation.`,
    ],
    general: [
      () =>
        `${name} is trading with its peer group today — the sector tone is louder than a standalone headline.`,
      () =>
        `For ${name}, macro and sector tone are doing the work; nothing name-specific is dominating.`,
      () =>
        `${name} fits the group move more than a one-off catalyst on this session.`,
    ],
  };

  const sym = symbol.toUpperCase();
  const pool = pools[type] || pools.general;

  if (sym === "TSLA" && type === "ev_high_beta") return [pool[0], pool[1], pool[2], pool[3]];
  if (sym === "NVDA" && type === "semi_ai") return [pool[0], pool[1], pool[2], pool[3]];
  if (sym === "AAPL" && type === "mega_cap_tech") {
    return [
      () =>
        `Apple's move appears more connected to broader mega-cap positioning and market tone than company-specific news.`,
      ...pool,
    ];
  }
  if (sym === "GOOGL" && type === "mega_cap_tech") {
    return [
      () =>
        `Alphabet is trading with search, ads, and cloud tone today — the mega-cap complex is doing more work than a single headline.`,
      () =>
        `${name} is moving with search and cloud sentiment; company-specific news is not leading the print.`,
      ...pool,
    ];
  }
  if (sym === "JPM" && type === "bank_financial") return [pool[0], pool[1], pool[2], pool[3]];
  if ((sym === "GLD" || sym === "SLV") && type === "gold_hedge") return [pool[0], pool[1], pool[2], pool[3]];

  return pool;
}

/**
 * @param {string} hook
 * @param {{ name: string, symbol: string, type: TickerVoiceType }} ctx
 */
function headlineVariants(hook, ctx) {
  const { name, type } = ctx;
  return [
    () => `${name} is responding to ${hook}; peer ${sectorWord(type)} tone is still in the mix.`,
    () => `The tape is focused on ${hook} for ${name} — the group move has not fully decoupled.`,
    () => `${name}: ${hook} is the lead story, with the wider ${sectorWord(type)} read still relevant.`,
  ];
}

/**
 * @param {TickerVoiceType} type
 */
function sectorWord(type) {
  const map = {
    semi_ai: "semiconductor",
    memory_semis: "memory semiconductor",
    legacy_semi: "semiconductor",
    cloud_software: "cloud software",
    telecom: "telecom",
    ev_high_beta: "growth",
    mega_cap_tech: "mega-cap tech",
    bank_financial: "financial",
    gold_hedge: "gold",
    energy: "energy",
    defensive_staples: "defensive",
    index_etf: "index",
    general: "sector",
  };
  return map[type] || "sector";
}

/**
 * @param {(() => string)[]} builders
 * @param {string} symbol
 * @param {string} name
 */
function pickBuilder(builders, symbol, name) {
  const used = getSessionPatterns();
  const base = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let offset = 0; offset < builders.length; offset++) {
    const idx = (base + offset) % builders.length;
    const text = builders[idx]();
    const key = tickerAnswerStructureKey(text, symbol, name);
    if (!used.includes(key)) {
      rememberPattern(key);
      return text;
    }
  }
  const fallback = builders[(base + used.length) % builders.length]();
  rememberPattern(tickerAnswerStructureKey(fallback, symbol, name));
  return fallback;
}

/**
 * @param {{ symbol: string, displayName?: string, quote?: { pctChange?: number }|null, headline?: string|null, text?: string|null }} input
 * @returns {string}
 */
export function applyTickerVoiceVariation(input) {
  const symbol = String(input.symbol || "").toUpperCase();
  const name = input.displayName || getTickerDisplayName(symbol) || symbol;
  const type = classifyTickerVoiceType(symbol);

  if (input.resetSession) {
    const list = getSessionPatterns();
    list.length = 0;
  }
  const headline = String(input.headline || "").trim();
  const hook =
    headline.length > 110 ? `${headline.slice(0, 107).trim()}…` : headline;

  let answer;

  if (hook && isSymbolSpecificHeadline(hook, symbol, name)) {
    const builders = headlineVariants(hook, { name, symbol, type });
    answer = pickBuilder(builders, symbol, name);
  } else if (input.text?.trim() && !looksLikeTickerTemplate(input.text)) {
    answer = input.text.trim();
    if (looksLikeTickerTemplate(answer)) {
      answer = pickBuilder(variantsForType(type, symbol, { name, symbol, quote: input.quote }), symbol, name);
    }
  } else {
    answer = pickBuilder(
      variantsForType(type, symbol, { name, symbol, quote: input.quote, headline: hook }),
      symbol,
      name
    );
  }

  const maxSentences = input.maxSentences ?? 2;
  return limitSentences(answer.replace(/\s+/g, " ").trim(), maxSentences);
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ headline?: string, quote?: { pctChange?: number }|null, maxSentences?: number }} [opts]
 */
export function applyTickerVoiceToResponse(res, opts = {}) {
  if (res.mode !== "ticker") return res;
  const symbol = String(res.primarySymbol || "").toUpperCase();
  if (!symbol) return res;

  const name =
    res.title?.split("·")[0]?.trim() ||
    getTickerDisplayName(symbol) ||
    symbol;

  const varied = applyTickerVoiceVariation({
    symbol,
    displayName: name,
    quote: opts.quote ?? null,
    headline: opts.headline ?? res.cards?.catalyst ?? "",
    text: res.directAnswer || res.summary || res.cards?.snapshot || "",
    maxSentences: opts.maxSentences ?? 2,
  });

  const out = {
    ...res,
    directAnswer: varied,
    summary: varied,
    cards: { ...(res.cards || {}), snapshot: varied, aiSummary: varied },
  };
  return out;
}

/** @param {string[]} symbols - test helper */
export function resetTickerVoiceSession() {
  const list = getSessionPatterns();
  list.length = 0;
}
