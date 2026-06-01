/**
 * Deep Dive context personalization (Phase 2.3).
 * WIM_DB remains canonical; this layer only frames content by entry source.
 * @module preview/ticker-deep-dive/deep-dive-context
 */

/** @typedef {'movers'|'scanner'|'portfolio'|'logic'|'watchlist'|'url'|'unknown'} DeepDiveSource */

/**
 * @typedef {Object} DeepDiveContext
 * @property {DeepDiveSource} source
 * @property {string} stripText
 * @property {string} [overviewLeadHtml]
 * @property {string} [driversLeadHtml]
 * @property {string} [positioningLeadHtml]
 * @property {string} [reactionHint]
 */

const SOURCE_KICKER = {
  movers: "From What's Moving",
  scanner: "From Discover Stocks",
  portfolio: "From My Portfolio",
  logic: "From Ask Logic",
  watchlist: "From Watchlist",
  url: "Deep Dive",
  unknown: "Deep Dive",
};

const DEFAULT_TAB = {
  movers: "overview",
  watchlist: "overview",
  scanner: "drivers",
  logic: "drivers",
  portfolio: "positioning",
};

const DRIVERS_TITLE = {
  movers: "Movement decomposition",
  scanner: "Why it's on your scan",
  portfolio: "Drivers affecting your holding",
  logic: "What Logic flagged",
  watchlist: "Movement decomposition",
};

const POSITIONING_TITLE = {
  movers: "Market Positioning",
  portfolio: "Your position in the book",
  scanner: "Market Positioning",
  logic: "Market Positioning",
  watchlist: "Market Positioning",
};

const SCANNER_MODE_LABELS = {
  momentum: "Big Movers",
  breakout: "Near 52-Week Highs",
  volume: "Unusual Volume",
  sector: "Today's Leaders",
};

const SCANNER_SCORE_LABELS = {
  momentum: "Strength score",
  breakout: "Breakout score",
  volume: "Volume score",
  sector: "Leadership score",
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} s
 */
function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} title
 * @param {string} bodyHtml
 * @param {string} [modifier]
 */
function contextBlock(title, bodyHtml, modifier = "") {
  if (!bodyHtml) return "";
  return `<div class="tdd-context-block tdd-context-block--${modifier || "default"}">
    <div class="tdd-context-block__title">${esc(title)}</div>
    <div class="tdd-context-block__body">${bodyHtml}</div>
  </div>`;
}

/**
 * @param {DeepDiveSource} source
 */
export function getSourceKicker(source) {
  return SOURCE_KICKER[source] || SOURCE_KICKER.unknown;
}

/**
 * @param {DeepDiveSource} source
 */
export function getDefaultTabForSource(source) {
  return DEFAULT_TAB[source] || "overview";
}

/**
 * @param {DeepDiveSource} source
 */
export function getDriversSectionTitle(source) {
  return DRIVERS_TITLE[source] || DRIVERS_TITLE.movers;
}

/**
 * @param {DeepDiveSource} source
 */
export function getPositioningSectionTitle(source) {
  return POSITIONING_TITLE[source] || POSITIONING_TITLE.movers;
}

/**
 * @param {object} s
 * @param {string} mode
 * @param {number} rank
 */
export function buildScannerWhyPlain(s, mode, rank) {
  const sign = s.pctChange >= 0 ? "+" : "";
  const pct = `${sign}${Number(s.pctChange).toFixed(2)}%`;
  const volPhrase =
    s.volRatio >= 2
      ? "higher than usual trading activity"
      : s.volRatio >= 1.2
        ? "above-average trading activity"
        : "typical trading activity";
  const posPct = Math.round(s.pos52 * 100);
  const rankPhrase =
    rank <= 5 ? `Ranked #${rank} on this list` : "Ranked in the top half of this scan";
  const modeLabel = SCANNER_MODE_LABELS[mode] || mode;

  if (mode === "breakout") {
    return `${rankPhrase} · ${modeLabel} · near 52-week high (${posPct}% of range), ${pct} today.`;
  }
  if (mode === "volume") {
    return `${rankPhrase} · ${modeLabel} · ${Number(s.volRatio).toFixed(1)}× usual volume, ${pct} today.`;
  }
  if (mode === "sector") {
    return `${rankPhrase} · ${modeLabel} · top gainer ${pct} in ${s.sector || "its sector"}.`;
  }
  return `${rankPhrase} · ${modeLabel} · ${pct} today, ${volPhrase}.`;
}

/**
 * @param {object} stock
 * @param {{ rank?: number, mode?: string }} [meta]
 */
export function buildScannerContext(stock, meta = {}) {
  const rank = meta.rank ?? stock.rank ?? 1;
  const mode = meta.mode || stock.scanMode || "momentum";
  const modeLabel = SCANNER_MODE_LABELS[mode] || mode;
  const scoreLabel = SCANNER_SCORE_LABELS[mode] || "Strength score";
  const sign = stock.pctChange >= 0 ? "+" : "";
  const pct = `${sign}${Number(stock.pctChange).toFixed(2)}%`;
  const strip = buildScannerWhyPlain(stock, mode, rank);

  const driversBody = `
    <p class="tdd-context-block__line"><span class="tdd-context-k">List</span> ${esc(modeLabel)} · <span class="tdd-context-k">Rank</span> #${esc(rank)}</p>
    <p class="tdd-context-block__line"><span class="tdd-context-k">${esc(scoreLabel)}</span> ${esc(stock.score)}/99 · <span class="tdd-context-k">Today</span> ${esc(pct)}</p>
    <p class="tdd-context-block__line"><span class="tdd-context-k">Volume</span> ${esc(Number(stock.volRatio).toFixed(1))}× vs typical</p>
    <p class="tdd-context-block__muted">${esc(stripHtml(buildScannerWhyLineHtml(stock, mode, rank)))}</p>`;

  const overviewBody = `
    <p class="tdd-context-block__line">Discover Stocks snapshot · ${esc(modeLabel)} · #${esc(rank)} · ${esc(pct)} · ${esc(Number(stock.volRatio).toFixed(1))}× volume</p>`;

  return {
    source: "scanner",
    stripText: strip,
    overviewLeadHtml: contextBlock("On your scan", overviewBody, "scanner"),
    driversLeadHtml: contextBlock("Scan context", driversBody, "scanner"),
    reactionHint: "Peers on this scan often move together — explore sympathy below.",
  };
}

/**
 * @param {object} s
 * @param {string} mode
 * @param {number} rank
 */
function buildScannerWhyLineHtml(s, mode, rank) {
  const sign = s.pctChange >= 0 ? "+" : "";
  const pct = `${sign}${s.pctChange.toFixed(2)}%`;
  const volPhrase =
    s.volRatio >= 2
      ? "higher than usual trading activity"
      : s.volRatio >= 1.2
        ? "above-average trading activity"
        : "typical trading activity";
  const posPct = Math.round(s.pos52 * 100);
  const rankPhrase = rank <= 5 ? `Ranked #${rank} on this list` : "Ranked in the top half of this scan";

  if (mode === "breakout") {
    return `${rankPhrase} — near its 52-week high (about ${posPct}% of the yearly range), ${pct} today.`;
  }
  if (mode === "volume") {
    return `${rankPhrase} for unusual volume (${s.volRatio.toFixed(1)}× typical), ${pct} today.`;
  }
  if (mode === "sector") {
    return `${rankPhrase} — one of today's top gainers (${pct}) in ${s.sector || "its sector"}.`;
  }
  return `${rankPhrase} among big movers — ${pct} today, ${volPhrase}.`;
}

/**
 * @param {{ symbol: string, weightPct?: number, pctChange?: number, price?: number, name?: string }} payload
 */
export function buildPortfolioContext(payload) {
  const sym = String(payload.symbol || "").toUpperCase();
  const w = Number(payload.weightPct);
  const weightStr = Number.isFinite(w) ? `${w.toFixed(1)}% of your book` : "in your holdings";
  const sign = Number(payload.pctChange) >= 0 ? "+" : "";
  const pct =
    payload.pctChange != null && !Number.isNaN(Number(payload.pctChange))
      ? `${sign}${Number(payload.pctChange).toFixed(2)}% today`
      : "session move updating";

  const strip = `${sym} · ${weightStr} · ${pct}`;

  const bookBody = `
    <p class="tdd-context-block__line"><span class="tdd-context-k">Weight</span> ${Number.isFinite(w) ? `${w.toFixed(1)}%` : "—"} of portfolio</p>
    <p class="tdd-context-block__line"><span class="tdd-context-k">Today</span> ${esc(pct)}</p>
    ${Number.isFinite(w) && w >= 20 ? `<p class="tdd-context-block__muted">Concentration note: a move in ${esc(sym)} has an outsized effect on total book volatility.</p>` : ""}`;

  const driversBody = `<p class="tdd-context-block__muted">Same drivers below — read through how they affect a ${Number.isFinite(w) ? `${w.toFixed(0)}%` : "meaningful"} position.</p>`;

  return {
    source: "portfolio",
    stripText: strip,
    overviewLeadHtml: contextBlock("Portfolio snapshot", bookBody, "portfolio"),
    driversLeadHtml: contextBlock("Book lens", driversBody, "portfolio"),
    positioningLeadHtml: contextBlock("Your holding", bookBody, "portfolio"),
  };
}

/**
 * @param {{ symbol: string, prompt?: string, answer?: string, confidenceLabel?: string }} payload
 */
export function buildLogicContext(payload) {
  const sym = String(payload.symbol || "").toUpperCase();
  const prompt = stripHtml(payload.prompt || "");
  const answer = stripHtml(payload.answer || "");
  const conf = payload.confidenceLabel ? ` · ${payload.confidenceLabel}` : "";

  const strip = prompt
    ? `You asked: ${prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt}`
    : `Continuing your Logic read on ${sym}`;

  const recapBody = `
    ${prompt ? `<p class="tdd-context-block__line"><span class="tdd-context-k">Question</span> ${esc(prompt)}</p>` : ""}
    ${answer ? `<p class="tdd-context-block__line"><span class="tdd-context-k">Logic</span> ${esc(answer.length > 320 ? `${answer.slice(0, 317)}…` : answer)}${esc(conf)}</p>` : ""}
    <p class="tdd-context-block__muted">Drivers below expand the same move with structured decomposition.</p>`;

  return {
    source: "logic",
    stripText: strip,
    overviewLeadHtml: contextBlock("Logic recap", recapBody, "logic"),
    driversLeadHtml: contextBlock("Logic recap", recapBody, "logic"),
  };
}

/**
 * @param {{ symbol: string, lead?: string, why?: string, chg?: string }} payload
 */
export function buildMoversContext(payload) {
  const sym = String(payload.symbol || "").toUpperCase();
  const lead = payload.lead || "";
  const why = payload.why || "";
  const chg = payload.chg ? ` · ${payload.chg}` : "";

  const strip = `Featured in today's Movers channel${chg}`;

  const body = `
    ${lead ? `<p class="tdd-context-block__line">${esc(lead)}</p>` : ""}
    ${why ? `<p class="tdd-context-block__line tdd-context-block__muted">${esc(why)}</p>` : ""}`;

  return {
    source: "movers",
    stripText: strip,
    overviewLeadHtml: contextBlock("Movers narrative", body, "movers"),
    driversLeadHtml: contextBlock("Movers context", body, "movers"),
    reactionHint: "Reaction map · sympathy from today's Movers leadership.",
  };
}

/**
 * @param {{ symbol: string, insight?: string, statusLabel?: string, pctChange?: number }} payload
 */
export function buildWatchlistContext(payload) {
  const sym = String(payload.symbol || "").toUpperCase();
  const insight = payload.insight || `${sym} on your watchlist`;
  const status = payload.statusLabel || "Watching";
  const sign = Number(payload.pctChange) >= 0 ? "+" : "";
  const pct =
    payload.pctChange != null && !Number.isNaN(Number(payload.pctChange))
      ? `${sign}${Number(payload.pctChange).toFixed(2)}% today`
      : null;

  const strip = pct
    ? `On your watchlist · ${status} · ${pct}`
    : `On your watchlist · ${status}`;

  const body = `
    <p class="tdd-context-block__line"><span class="tdd-context-k">Status</span> ${esc(status)}</p>
    ${pct ? `<p class="tdd-context-block__line"><span class="tdd-context-k">Move</span> ${esc(pct)}</p>` : ""}
    <p class="tdd-context-block__line">${esc(insight)}</p>`;

  return {
    source: "watchlist",
    stripText: strip,
    overviewLeadHtml: contextBlock("Watchlist", body, "watchlist"),
    driversLeadHtml: contextBlock("Why you're watching", body, "watchlist"),
  };
}

/**
 * @param {DeepDiveSource} source
 * @param {object} [payload]
 * @returns {DeepDiveContext|null}
 */
export function buildDeepDiveContext(source, payload = {}) {
  const s = source === "movers" ? "movers" : source;
  if (s === "scanner" && payload.stock) return buildScannerContext(payload.stock, payload);
  if (s === "portfolio") return buildPortfolioContext(payload);
  if (s === "logic") return buildLogicContext(payload);
  if (s === "movers") return buildMoversContext(payload);
  if (s === "watchlist") return buildWatchlistContext(payload);
  return null;
}

/**
 * @param {DeepDiveContext|null} ctx
 */
export function renderContextStrip(ctx) {
  if (!ctx?.stripText) return "";
  return `<p class="ticker-deep-dive__context-strip" id="tddContextStrip">${esc(ctx.stripText)}</p>`;
}

/**
 * @param {DeepDiveContext|null} ctx
 * @param {'overview'|'drivers'|'positioning'} panel
 */
export function getPanelLeadHtml(ctx, panel) {
  if (!ctx) return "";
  if (panel === "overview") return ctx.overviewLeadHtml || "";
  if (panel === "drivers") return ctx.driversLeadHtml || "";
  if (panel === "positioning") return ctx.positioningLeadHtml || "";
  return "";
}
