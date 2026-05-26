/**
 * Topic extraction and headline relevance for news-style Logic queries.
 * @module logic/engines/topicContext
 */

/** @typedef {'briefing'|'hypothetical'} ScenarioQueryKind */

const TOPIC_KEYWORDS = {
  iran: [
    "iran",
    "iranian",
    "tehran",
    "irgc",
    "hormuz",
    "persian gulf",
    "khamenei",
  ],
  ukraine: ["ukraine", "ukrainian", "kyiv", "zelensky"],
  gaza: ["gaza", "hamas", "palestinian"],
  israel: ["israel", "israeli", "idf"],
  middle_east: ["middle east", "mideast", "gulf", "saudi", "israel", "iran"],
  war: [
    "war",
    "conflict",
    "strike",
    "strikes",
    "military",
    "invasion",
    "ceasefire",
    "missile",
    "troops",
    "bombing",
  ],
  oil: ["oil", "crude", "opec", "energy price", "brent", "wti"],
  sanctions: ["sanctions", "embargo"],
  geopolitics: ["geopolit", "geopolitical", "diplomatic", "tension"],
  fed: ["fed", "fomc", "powell", "rate cut", "rate hike"],
  inflation: ["inflation", "cpi", "pce", "prices"],
  supply: ["supply chain", "shipping", "freight", "logistics", "port"],
};

/**
 * @param {string} prompt
 * @returns {string[]}
 */
export function extractPromptTopics(prompt) {
  const t = (prompt || "").toLowerCase();
  /** @type {string[]} */
  const found = [];
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) found.push(topic);
  }
  return found;
}

/**
 * @param {string} prompt
 * @returns {string[]}
 */
export function collectSearchTerms(prompt) {
  const t = (prompt || "").toLowerCase();
  const terms = new Set();
  for (const words of Object.values(TOPIC_KEYWORDS)) {
    for (const w of words) {
      if (t.includes(w)) terms.add(w);
    }
  }
  // Loose tokens from prompt (skip stop words)
  const stop = new Set([
    "the",
    "a",
    "an",
    "on",
    "in",
    "at",
    "is",
    "are",
    "what",
    "why",
    "how",
    "latest",
    "about",
    "give",
    "me",
    "and",
    "or",
    "war",
    "?",
  ]);
  t.replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .forEach((w) => terms.add(w));
  if (/iran/.test(t)) terms.add("iran");
  if (/war/.test(t)) {
    terms.add("war");
    terms.add("conflict");
  }
  return [...terms];
}

/**
 * @param {object[]} headlines
 * @param {string} prompt
 * @returns {object[]}
 */
export function filterHeadlinesForPrompt(headlines, prompt) {
  const list = headlines || [];
  if (!list.length) return [];
  const terms = collectSearchTerms(prompt);
  if (!terms.length) return list;

  const scored = list.map((n) => {
    const blob = `${n.headline || ""} ${n.summary || ""}`.toLowerCase();
    const score = terms.reduce((s, term) => (blob.includes(term) ? s + 1 : s), 0);
    return { n, score };
  });

  const relevant = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (relevant.length) return relevant.map((x) => x.n);
  return list;
}

/**
 * @param {string} prompt
 * @returns {boolean}
 */
export function isGeopoliticalBriefingQuery(prompt) {
  const t = (prompt || "").toLowerCase().trim();
  if (!t) return false;

  const hasGeoTopic =
    /iran|ukraine|gaza|israel|hamas|hezbollah|middle east|hormuz|strait|sanctions|geopolit|north korea|taiwan strait|red sea|yemen|houthi/i.test(
      t
    ) || extractPromptTopics(prompt).length > 0;

  const wantsUpdate =
    /latest\s+(on|about|regarding)|what.?'?s the latest|update on|news on|situation in|status of|current state of|what.?'?s happening|happening in|tell me about.*war|war\?/i.test(
      t
    ) ||
    (/latest|update|news|headline|today/i.test(t) && /war|conflict|iran|ukraine|gaza|strike|military/i.test(t));

  return hasGeoTopic && (wantsUpdate || /war|conflict|iran|ukraine|gaza|strike|military|geopolit/i.test(t));
}

/**
 * @param {string} prompt
 * @returns {ScenarioQueryKind}
 */
export function detectScenarioQueryKind(prompt) {
  if (/what happens if|what if|scenario|hypothetical/i.test(prompt || "")) return "hypothetical";
  return "hypothetical";
}

/**
 * @param {string} text
 * @param {number} [maxLen]
 */
export function concise(text, maxLen = 200) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const period = slice.lastIndexOf(". ");
  if (period > maxLen * 0.45) return slice.slice(0, period + 1);
  return slice.trimEnd() + "…";
}
