/**
 * Headline context — highly relevant supporting headlines only.
 * @module logic/engines/headlineContext
 */

import { filterHeadlinesForPrompt, collectSearchTerms, concise } from "./topicContext.js";

const NOISE_PATTERNS = [
  /^three months in,/i,
  /is trump losing/i,
  /^\s*-\s*reuters\s*$/i,
  /breaking:\s*$/i,
];

/**
 * @param {string} headline
 */
export function cleanHeadlineText(headline) {
  let h = String(headline || "").trim();
  for (const p of NOISE_PATTERNS) h = h.replace(p, "").trim();
  h = h.replace(/\s+-\s+Reuters\s*$/i, "").trim();
  return h;
}

/**
 * @param {object} item
 * @param {string} prompt
 */
function scoreHeadline(item, prompt) {
  const terms = collectSearchTerms(prompt);
  const blob = `${item.headline || ""} ${item.summary || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (blob.includes(term)) score += 1;
  }
  if (NOISE_PATTERNS.some((p) => p.test(item.headline || ""))) score -= 3;
  if ((item.headline || "").length > 140) score -= 1;
  return score;
}

/**
 * @param {object[]} headlines
 * @param {string} prompt
 * @param {number} [max]
 */
export function selectSupportingHeadlines(headlines, prompt, max = 1) {
  const filtered = filterHeadlinesForPrompt(headlines || [], prompt);
  const scored = filtered
    .map((h) => ({ h, score: scoreHeadline(h, prompt) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored.slice(0, max).map((x) => x.h);

  const loose = filtered
    .map((h) => ({ h, score: scoreHeadline(h, prompt) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score);
  return loose.slice(0, max).map((x) => x.h);
}

/**
 * @param {object[]} headlines
 * @param {string} prompt
 */
export function formatHeadlineSupport(headlines, prompt) {
  const picked = selectSupportingHeadlines(headlines, prompt, 1);
  if (!picked.length) return "";
  const clean = cleanHeadlineText(picked[0].headline);
  if (!clean || clean.length < 12) return "";
  return concise(`Supporting context: ${clean}`, 160);
}
