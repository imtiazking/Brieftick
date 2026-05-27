/**
 * Movers / Why-is-it-moving symbol lookup — shared by dashboard search and Logic.
 * Same behaviour as index.html resolveTickerInput + CMD_TICKERS directory.
 * @module lib/moversSymbolLookup
 */

/** @typedef {'equity'|'etf'|'index'|'adr'} AssetType */

/**
 * @typedef {Object} MoversSymbolRow
 * @property {string} symbol
 * @property {string} name
 * @property {AssetType} [assetType]
 * @property {string} [exchange]
 * @property {string} [sector]
 */

/**
 * @typedef {Object} MoversLookupResult
 * @property {boolean} ok
 * @property {string} [symbol]
 * @property {string} [name]
 * @property {AssetType} [assetType]
 * @property {string} [exchange]
 * @property {string} [sector]
 * @property {number} [confidence]
 * @property {string} [source]
 * @property {string} [candidate]
 * @property {string} [rawInput]
 * @property {{ symbol: string, name: string }[]} [suggestions]
 */

/** CMD_TICKERS + scanner universe + extensions (single directory). */
export const MOVERS_SYMBOL_DIRECTORY = [
  ["NVDA", "NVIDIA Corporation", "Tech", "equity"],
  ["AAPL", "Apple Inc", "Tech", "equity"],
  ["MSFT", "Microsoft Corporation", "Tech", "equity"],
  ["GOOGL", "Alphabet Inc", "Tech", "equity"],
  ["META", "Meta Platforms", "Tech", "equity"],
  ["AMZN", "Amazon.com Inc", "Tech", "equity"],
  ["TSLA", "Tesla Inc", "Consumer", "equity"],
  ["AMD", "Advanced Micro Devices", "Tech", "equity"],
  ["AVGO", "Broadcom Inc", "Tech", "equity"],
  ["NFLX", "Netflix Inc", "Tech", "equity"],
  ["JPM", "JPMorgan Chase", "Financials", "equity"],
  ["BAC", "Bank of America", "Financials", "equity"],
  ["GS", "Goldman Sachs", "Financials", "equity"],
  ["XOM", "Exxon Mobil", "Energy", "equity"],
  ["CVX", "Chevron Corp", "Energy", "equity"],
  ["JNJ", "Johnson & Johnson", "Healthcare", "equity"],
  ["UNH", "UnitedHealth Group", "Healthcare", "equity"],
  ["WMT", "Walmart Inc", "Consumer", "equity"],
  ["PG", "Procter & Gamble", "Consumer", "equity"],
  ["SPY", "S&P 500 ETF", "ETF", "etf"],
  ["QQQ", "Nasdaq 100 ETF", "ETF", "etf"],
  ["DIA", "Dow Jones ETF", "ETF", "etf"],
  ["IWM", "Russell 2000 ETF", "ETF", "etf"],
  ["GLD", "Gold ETF", "ETF", "etf"],
  ["USO", "US Oil Fund", "ETF", "etf"],
  ["INTC", "Intel Corporation", "Tech", "equity"],
  ["QCOM", "Qualcomm Inc", "Tech", "equity"],
  ["TSM", "Taiwan Semiconductor", "Tech", "equity"],
  ["SOXX", "Semiconductor ETF", "ETF", "etf"],
  ["XLK", "Technology Sector ETF", "ETF", "etf"],
  ["XLE", "Energy Sector ETF", "ETF", "etf"],
  ["XLF", "Financials Sector ETF", "ETF", "etf"],
  ["XLV", "Healthcare Sector ETF", "ETF", "etf"],
  ["MU", "Micron Technology", "Tech", "equity"],
  ["SNDK", "SanDisk Corp", "Tech", "equity"],
  ["MCHP", "Microchip Technology", "Tech", "equity"],
  ["CRM", "Salesforce Inc", "Tech", "equity"],
  ["ORCL", "Oracle Corp", "Tech", "equity"],
  ["IBM", "IBM Corp", "Tech", "equity"],
  ["V", "Visa Inc", "Financials", "equity"],
  ["MA", "Mastercard Inc", "Financials", "equity"],
  ["COIN", "Coinbase Global", "Financials", "equity"],
  ["HOOD", "Robinhood Markets", "Financials", "equity"],
  ["LRCX", "Lam Research", "Tech", "equity"],
  ["IREN", "Iris Energy", "Tech", "equity"],
  ["SNOW", "Snowflake", "Tech", "equity"],
  ["NOK", "Nokia", "Tech", "equity"],
  ["PLTR", "Palantir", "Tech", "equity"],
  ["UBER", "Uber Technologies", "Tech", "equity"],
  ["DIS", "Walt Disney", "Consumer", "equity"],
  ["LLY", "Eli Lilly", "Healthcare", "equity"],
  ["PFE", "Pfizer Inc", "Healthcare", "equity"],
  ["COST", "Costco Wholesale", "Consumer", "equity"],
  ["NKE", "Nike Inc", "Consumer", "equity"],
  ["BA", "Boeing Co", "Industrial", "equity"],
  ["CAT", "Caterpillar Inc", "Industrial", "equity"],
  ["GE", "GE Aerospace", "Industrial", "equity"],
  ["BRK.B", "Berkshire Hathaway", "Financials", "equity"],
  ["SMCI", "Super Micro Computer", "Tech", "equity"],
  ["ARM", "Arm Holdings", "Tech", "equity"],
  ["ASML", "ASML Holding", "Tech", "equity"],
  ["SLV", "Silver ETF", "ETF", "etf"],
  ["UNG", "Natural Gas ETF", "ETF", "etf"],
  ["UUP", "US Dollar Bullish ETF", "ETF", "etf"],
  ["RIVN", "Rivian Automotive", "Consumer", "equity"],
  ["MS", "Morgan Stanley", "Financials", "equity"],
];

/** @type {Record<string, string>} */
export const MOVERS_TICKER_ALIASES = {
  intel: "INTC",
  "intel stock": "INTC",
  "intel corporation": "INTC",
  "intel corp": "INTC",
  intc: "INTC",
  nvidia: "NVDA",
  "nvidia stock": "NVDA",
  nvda: "NVDA",
  nvdia: "NVDA",
  tesla: "TSLA",
  "tesla stock": "TSLA",
  tsla: "TSLA",
  apple: "AAPL",
  "apple stock": "AAPL",
  aapl: "AAPL",
  microsoft: "MSFT",
  "microsoft stock": "MSFT",
  msft: "MSFT",
  alphabet: "GOOGL",
  google: "GOOGL",
  "google stock": "GOOGL",
  googl: "GOOGL",
  goog: "GOOGL",
  meta: "META",
  facebook: "META",
  "meta stock": "META",
  amd: "AMD",
  "advanced micro devices": "AMD",
  "advanced micro devices stock": "AMD",
  broadcom: "AVGO",
  "broadcom stock": "AVGO",
  avgo: "AVGO",
  netflix: "NFLX",
  "netflix stock": "NFLX",
  nflx: "NFLX",
  jpmorgan: "JPM",
  "jp morgan": "JPM",
  "jpmorgan chase": "JPM",
  jpm: "JPM",
  "bank of america": "BAC",
  bac: "BAC",
  exxon: "XOM",
  "exxon mobil": "XOM",
  xom: "XOM",
  chevron: "CVX",
  cvx: "CVX",
  "s&p 500": "SPY",
  sp500: "SPY",
  spy: "SPY",
  "s and p 500": "SPY",
  "s&p 500 etf": "SPY",
  nasdaq: "QQQ",
  "nasdaq 100": "QQQ",
  "nasdaq 100 etf": "QQQ",
  qqq: "QQQ",
  micron: "MU",
  "micron technology": "MU",
  mu: "MU",
  snowflake: "SNOW",
  "snowflake inc": "SNOW",
  snow: "SNOW",
  nokia: "NOK",
  "nokia corporation": "NOK",
  nok: "NOK",
  "lam research": "LRCX",
  lrcx: "LRCX",
  "iris energy": "IREN",
  iren: "IREN",
  "gold etf": "GLD",
  gld: "GLD",
  palantir: "PLTR",
  pltr: "PLTR",
  coinbase: "COIN",
  coin: "COIN",
  uber: "UBER",
  disney: "DIS",
  dis: "DIS",
  salesforce: "CRM",
  crm: "CRM",
  oracle: "ORCL",
  orcl: "ORCL",
  "super micro": "SMCI",
  supermicro: "SMCI",
  smci: "SMCI",
  sandisk: "SNDK",
  "sandisk corp": "SNDK",
  sndk: "SNDK",
  microchip: "MCHP",
  "microchip technology": "MCHP",
  microship: "MCHP",
  "microship technology": "MCHP",
  mchp: "MCHP",
};

const DIRECTORY_ROWS = MOVERS_SYMBOL_DIRECTORY.map(([symbol, name, sector, assetType]) => ({
  symbol,
  name,
  sector: sector || "",
  assetType: /** @type {AssetType} */ (assetType || "equity"),
  exchange: assetType === "etf" || assetType === "index" ? "ETF" : "US",
  nameNorm: name.toLowerCase(),
}));

const BY_SYMBOL = new Map(DIRECTORY_ROWS.map((r) => [r.symbol, r]));

/**
 * @param {string} value
 */
export function cleanTickerSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 12);
}

/**
 * @param {string} value
 */
export function normalizeAliasKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(stock|shares|ticker|company|corp|corporation|inc|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} prompt
 */
export function normalizePromptText(prompt) {
  return String(prompt || "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^\w\s.'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INVALID_CANDIDATE_PHRASES = new Set([
  "it",
  "this",
  "that",
  "the",
  "they",
  "there",
  "stock",
  "the stock",
  "this stock",
]);

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeCandidatePhrase(raw) {
  const s = String(raw || "")
    .replace(/\?$/g, "")
    .trim();
  if (!s || INVALID_CANDIDATE_PHRASES.has(s)) return "";
  return s;
}

/**
 * @param {string} nameNorm
 * @param {string} q
 */
function nameMatchesQuery(nameNorm, q) {
  if (!nameNorm || !q) return false;
  if (nameNorm === q) return true;

  const qWords = q.split(/\s+/).filter(Boolean);
  const nameWords = nameNorm.split(/\s+/).filter(Boolean);

  if (q.length < 4) {
    return qWords.every((qw) => nameWords.some((nw) => nw === qw || (qw.length >= 3 && nw.startsWith(qw))));
  }

  if (nameNorm.startsWith(q) || q.startsWith(nameWords[0] || "")) return true;
  if (nameNorm.includes(q)) return true;
  if (q.includes(nameNorm) && nameNorm.length >= 6) return true;

  return qWords.length > 1 && qWords.every((qw) => nameWords.some((nw) => nw === qw || nw.startsWith(qw)));
}

/**
 * @param {string} prompt
 * @returns {string}
 */
export function extractTickerCandidate(prompt) {
  const n = normalizePromptText(prompt);
  if (!n) return "";

  const leadingPatterns = [
    /^([a-z0-9][a-z0-9\s.'/-]{1,60}?)\s+why\s+is\s+it\s+moving/,
    /^([a-z0-9][a-z0-9\s.'/-]{1,60}?)\s+why\s+is\s+(?:the\s+stock|this)\s+moving/,
    /^([a-z0-9][a-z0-9\s.'/-]{1,60}?)\s+why\s+is\s+it\s+(?:down|up|weak|strong|lower|higher)/,
    /^([a-z0-9][a-z0-9\s.'/-]{1,60}?)\s+why\s+(?:did|has)\s+it\s+/,
    /^([a-z0-9][a-z0-9\s.'/-]{1,60}?)\s+why\b/,
  ];

  for (const re of leadingPatterns) {
    const m = n.match(re);
    const candidate = sanitizeCandidatePhrase(m?.[1] || "");
    if (candidate) return candidate;
  }

  const patterns = [
    /why is\s+(.+?)\s+moving/,
    /why are\s+(.+?)\s+moving/,
    /why is\s+(.+?)\s+(?:down|up|weak|strong|lower|higher)/,
    /why did\s+(.+?)\s+(?:drop|rally|move|fall|rise)/,
    /what is\s+(.+?)\s+moving/,
    /what'?s driving\s+(.+?)(?:\?|$)/,
    /what is driving\s+(.+?)(?:\?|$)/,
    /(?:latest|news)\s+(?:on|for|about)\s+(.+?)(?:\?|$)/,
    /how is\s+(.+?)\s+moving/,
  ];

  for (const re of patterns) {
    const m = n.match(re);
    const candidate = sanitizeCandidatePhrase(m?.[1] || "");
    if (candidate) return candidate;
  }

  return n;
}

/**
 * @param {MoversSymbolRow|null|undefined} row
 * @param {number} confidence
 * @param {string} source
 * @param {string} rawInput
 * @param {string} candidate
 */
function toResult(row, confidence, source, rawInput, candidate) {
  if (!row?.symbol || !row?.name) {
    return { ok: false, rawInput, candidate, suggestions: [], confidence: 0, source };
  }
  return {
    ok: confidence >= 72,
    symbol: row.symbol,
    name: row.name,
    assetType: row.assetType || "equity",
    exchange: row.exchange || "US",
    sector: row.sector,
    confidence,
    source,
    rawInput,
    candidate,
    suggestions: [],
  };
}

/**
 * @param {string} query
 */
function searchDirectoryByName(query) {
  const q = normalizeAliasKey(query);
  if (!q || q.length < 2) return null;

  if (MOVERS_TICKER_ALIASES[q]) {
    return BY_SYMBOL.get(MOVERS_TICKER_ALIASES[q]) || null;
  }

  let best = null;
  for (const row of DIRECTORY_ROWS) {
    if (!nameMatchesQuery(row.nameNorm, q)) continue;
    if (!best || row.nameNorm.length > best.nameNorm.length) {
      best = row;
    }
  }
  return best;
}

/**
 * @param {string} normalizedFull
 */
function searchDirectoryInPrompt(normalizedFull) {
  const upper = normalizedFull.toUpperCase();
  let symHit = null;
  for (const row of DIRECTORY_ROWS) {
    const escaped = row.symbol.replace(/\./g, "\\.");
    const re = new RegExp(`(?:\\$|\\b)${escaped}(?:\\b|$)`);
    if (re.test(upper)) {
      if (!symHit || row.symbol.length > symHit.symbol.length) symHit = row;
    }
  }
  if (symHit) return symHit;

  let nameHit = null;
  for (const row of DIRECTORY_ROWS) {
    if (row.nameNorm.length < 5) continue;
    if (!normalizedFull.includes(row.nameNorm)) continue;
    if (!nameHit || row.nameNorm.length > nameHit.nameNorm.length) nameHit = row;
  }
  return nameHit;
}

/**
 * Movers-style symbol resolution (resolveTickerInput + directory).
 * @param {string} input
 * @returns {MoversLookupResult}
 */
export function lookupMoversSymbol(input) {
  const rawInput = String(input || "").trim();
  const candidate = normalizeAliasKey(rawInput);
  if (!rawInput) {
    return { ok: false, rawInput, candidate, suggestions: [], confidence: 0, source: "movers-empty" };
  }
  if (INVALID_CANDIDATE_PHRASES.has(candidate)) {
    return {
      ok: false,
      rawInput,
      candidate,
      suggestions: [],
      confidence: 0,
      source: "movers-invalid-candidate",
    };
  }

  if (MOVERS_TICKER_ALIASES[candidate]) {
    const sym = MOVERS_TICKER_ALIASES[candidate];
    const row = BY_SYMBOL.get(sym) || { symbol: sym, name: sym, assetType: "equity", exchange: "US" };
    return toResult(row, 96, "movers-alias", rawInput, candidate);
  }

  const nameRow = searchDirectoryByName(candidate);
  if (nameRow) {
    return toResult(nameRow, 90, "movers-directory-name", rawInput, candidate);
  }

  const sym = cleanTickerSymbol(
    candidate.includes(" ") ? candidate.split(/\s+/).pop() || "" : candidate
  );
  if (/^[A-Z]{1,6}(\.[A-Z])?$/.test(sym)) {
    if (!BY_SYMBOL.has(sym) && sym.length < 3) {
      return {
        ok: false,
        rawInput,
        candidate,
        confidence: 0,
        source: "movers-unresolved",
        suggestions: suggestSymbols(candidate),
      };
    }
    const row = BY_SYMBOL.get(sym) || {
      symbol: sym,
      name: sym,
      assetType: "equity",
      exchange: "US",
      sector: "",
    };
    const conf = BY_SYMBOL.has(sym) ? 92 : 78;
    return toResult(row, conf, BY_SYMBOL.has(sym) ? "movers-directory-symbol" : "movers-symbol-parse", rawInput, candidate);
  }

  return {
    ok: false,
    rawInput,
    candidate,
    confidence: 0,
    source: "movers-unresolved",
    suggestions: suggestSymbols(candidate),
  };
}

/**
 * @param {string} prompt
 * @returns {MoversLookupResult}
 */
export function resolveMoversSymbolFromPrompt(prompt) {
  const rawInput = String(prompt || "").trim();
  const candidatePhrase = extractTickerCandidate(prompt);
  let result = lookupMoversSymbol(candidatePhrase);
  if (result.ok) {
    result.rawInput = rawInput;
    result.candidate = candidatePhrase;
    return result;
  }

  const inText = searchDirectoryInPrompt(normalizePromptText(prompt));
  if (inText) {
    result = toResult(inText, 88, "movers-prompt-scan", rawInput, candidatePhrase);
    return result;
  }

  return {
    ok: false,
    rawInput,
    candidate: candidatePhrase,
    confidence: 0,
    source: "movers-unresolved",
    suggestions: suggestSymbols(candidatePhrase),
  };
}

/**
 * Back-compat: same return shape as index.html resolveTickerInput (symbol string only).
 * @param {string} value
 */
export function resolveMoversSymbolInput(value) {
  const r = lookupMoversSymbol(value);
  return r.ok && r.symbol ? r.symbol : cleanTickerSymbol(value);
}

/**
 * CMD_TICKERS-style search for UI.
 * @param {string} query
 * @param {number} [limit]
 */
export function searchMoversDirectory(query, limit = 10) {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return DIRECTORY_ROWS.slice(0, limit);

  const matches = DIRECTORY_ROWS.filter(
    (row) => row.symbol.startsWith(q) || row.name.toUpperCase().includes(q)
  );

  if (!matches.find((m) => m.symbol === q) && /^[A-Z]{1,6}$/.test(q)) {
    matches.unshift({
      symbol: q,
      name: `${q} · search`,
      sector: "",
      assetType: "equity",
      exchange: "US",
      nameNorm: q.toLowerCase(),
    });
  }

  return matches.slice(0, limit);
}

/**
 * @param {string} normalized
 */
function suggestSymbols(normalized) {
  const tokens = normalized.split(/\s+/).filter((w) => w.length >= 3);
  /** @type {Map<string, { symbol: string, name: string }>} */
  const out = new Map();
  for (const token of tokens) {
    if (MOVERS_TICKER_ALIASES[token]) {
      const sym = MOVERS_TICKER_ALIASES[token];
      const row = BY_SYMBOL.get(sym);
      out.set(sym, { symbol: sym, name: row?.name || sym });
      continue;
    }
    const row = searchDirectoryByName(token);
    if (row) out.set(row.symbol, { symbol: row.symbol, name: row.name });
  }
  return [...out.values()].slice(0, 3);
}

/**
 * @param {string} symbol
 */
export function getMoversSymbolRow(symbol) {
  return BY_SYMBOL.get(cleanTickerSymbol(symbol)) || null;
}

/**
 * @param {string} symbol
 */
export function isMoversSearchableSymbol(symbol) {
  const sym = cleanTickerSymbol(symbol);
  return /^[A-Z]{1,6}(\.[A-Z])?$/.test(sym);
}
