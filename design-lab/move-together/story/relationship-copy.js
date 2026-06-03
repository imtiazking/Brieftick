/**
 * Relationship Story — short plain-English copy (max 2 sentences · 40 words).
 * @module design-lab/move-together/story/relationship-copy
 */

import { edgesFor, other, stock } from "/design-lab/move-together/_together-mock.js";
import {
  pairStrengthForCustom,
  themeGroupSentences,
  themePairSentences,
} from "/design-lab/move-together/story/custom-relationship-meta.js";

export { buildCustomRelationshipMeta } from "/design-lab/move-together/story/custom-relationship-meta.js";

export const MAX_INSIGHT_WORDS = 40;
export const MAX_INSIGHT_SENTENCES = 2;

export const SHARED_THEMES = {
  ai: "AI Infrastructure",
  banks: "Banking & Rates",
  energy: "Energy Markets",
  health: "Healthcare",
  market: "Broad Market",
};

/** @type {Record<string, string[]>} */
const PAIR_INSIGHTS = {
  "AMD|NVDA": [
    "Both companies benefit from rising AI infrastructure spending.",
    "Investors often react to the same AI demand signals when trading these stocks.",
  ],
  "AVGO|NVDA": [
    "Broadcom provides networking technology used in AI data centres.",
    "When AI investment expectations rise, both stocks often benefit.",
  ],
  "MSFT|NVDA": [
    "NVIDIA chips power much of the cloud and AI build-out Microsoft sells.",
    "When AI capex headlines hit, both names often move the same way.",
  ],
  "GOOGL|MSFT": [
    "Both companies compete in cloud and artificial intelligence.",
    "Investor sentiment around technology growth often affects them together.",
  ],
  "META|MSFT": [
    "Both rely on digital ads and heavy investment in AI infrastructure.",
    "When tech growth is in favour, these stocks often rise together.",
  ],
  "AMZN|MSFT": [
    "Both are major cloud platforms racing to add AI services.",
    "Enterprise AI spending news often moves both stocks in step.",
  ],
  "GOOGL|META": [
    "Both earn most of their revenue from online advertising.",
    "Ad spending and AI product news often sway them together.",
  ],
  "AMD|AVGO": [
    "Both supply chips and components for servers and data centres.",
    "Strong AI hardware demand often lifts both names at once.",
  ],
  "BAC|JPM": [
    "Both are large US banks sensitive to interest-rate expectations.",
    "When rate outlook shifts, investors often trade them as a pair.",
  ],
  "JPM|SPY": [
    "JPMorgan moves with the broad market but often amplifies bank news.",
    "When financial stocks lead, JPM and the S&P 500 often align.",
  ],
  "BAC|SPY": [
    "Bank of America tracks the market with extra sensitivity to rates.",
    "Risk-on days often lift both the index and large bank stocks.",
  ],
};

/** @type {Record<string, string[]>} */
const GROUP_INSIGHTS = {
  NVDA: [
    "These names often trade on the same AI infrastructure story.",
    "Hover a partner to see the clearest link in plain English.",
  ],
  MSFT: [
    "Big tech and cloud names often move when AI and ad spending shift.",
    "Hover a partner to see how each one connects to Microsoft.",
  ],
  JPM: [
    "Banks and the broad market often react together to rate news.",
    "Hover a partner to see the strongest connection.",
  ],
};

/**
 * @param {string} a
 * @param {string} b
 */
export function pairKey(a, b) {
  return [a, b].sort().join("|");
}

/**
 * @param {string} sym
 */
export function sharedThemeFor(sym) {
  const sector = stock(sym)?.sector;
  return SHARED_THEMES[sector] || "Shared Market Forces";
}

/**
 * @param {string[]} sentences
 * @returns {string[]}
 */
export function clampInsight(sentences) {
  const trimmed = sentences
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, MAX_INSIGHT_SENTENCES);

  const words = trimmed.join(" ").split(/\s+/).filter(Boolean);
  if (words.length <= MAX_INSIGHT_WORDS) return trimmed;

  const out = [];
  let used = 0;
  for (const sentence of trimmed) {
    const parts = sentence.split(/\s+/).filter(Boolean);
    const room = MAX_INSIGHT_WORDS - used;
    if (room <= 0) break;
    if (parts.length <= room) {
      out.push(sentence);
      used += parts.length;
    } else {
      out.push(parts.slice(0, room).join(" ") + "…");
      break;
    }
  }
  return out.length ? out : [trimmed[0].split(/\s+/).slice(0, MAX_INSIGHT_WORDS).join(" ")];
}

/**
 * @param {string} hero
 * @param {string} peer
 * @returns {string[]}
 */
export function insightForPair(hero, peer) {
  const key = pairKey(hero, peer);
  if (PAIR_INSIGHTS[key]) return clampInsight(PAIR_INSIGHTS[key]);

  const theme = sharedThemeFor(hero);
  return clampInsight([
    `Both names are often grouped under ${theme}.`,
    `When that theme leads the session, they frequently move together.`,
  ]);
}

/**
 * @param {string} hero
 * @param {string[]} relatives
 * @returns {string[]}
 */
export function insightForGroup(hero, relatives) {
  if (GROUP_INSIGHTS[hero]) return clampInsight(GROUP_INSIGHTS[hero]);

  const theme = sharedThemeFor(hero);
  return clampInsight([
    `These stocks often share the ${theme} theme.`,
    `Hover a partner to see the strongest pairwise link.`,
  ]);
}

/**
 * @typedef {import('/design-lab/move-together/story/custom-relationship-meta.js').CustomRelationshipMeta} CustomRelationshipMeta
 */

/**
 * @param {CustomRelationshipMeta} meta
 * @param {string} peer
 * @returns {string[]}
 */
export function insightForCustomPair(meta, peer) {
  const key = pairKey(meta.hero, peer);
  if (PAIR_INSIGHTS[key]) return insightForPair(meta.hero, peer);

  const edge = edgesFor(meta.hero).find((e) => other(meta.hero, e) === peer);
  if (edge) return insightForPair(meta.hero, peer);

  return clampInsight(themePairSentences(meta.theme));
}

/**
 * @param {CustomRelationshipMeta} meta
 * @returns {string[]}
 */
export function insightForCustomGroup(meta) {
  return clampInsight(themeGroupSentences(meta.theme));
}

/**
 * @typedef {{ mode: 'estimated' | 'unavailable', pct?: number | null }} StrengthDisplay
 */

/**
 * @param {number} pct 0–100
 * @param {{ compact?: boolean }} [opts]
 */
export function strengthMeterHtml(pct, opts = {}) {
  const n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  const filled = Math.max(0, Math.min(10, Math.round(n / 10)));
  const segs = Array.from({ length: 10 }, (_, i) => {
    const on = i < filled ? " is-on" : "";
    return `<span class="rs-strength__seg${on}"></span>`;
  }).join("");

  return `<div class="rs-strength${opts.compact ? " rs-strength--compact" : ""}" aria-hidden="true">
    <div class="rs-strength__track">${segs}</div>
    <strong class="rs-strength__pct">${n}%</strong>
  </div>`;
}

/**
 * @param {StrengthDisplay} strength
 * @param {{ compact?: boolean }} [opts]
 */
export function strengthDisplayHtml(strength, opts = {}) {
  const compact = opts.compact ? " rs-strength--compact" : "";

  if (strength.mode === "unavailable") {
    const segs = Array.from({ length: 10 }, () => `<span class="rs-strength__seg"></span>`).join("");
    return `<div class="rs-strength rs-strength--label rs-strength--muted${compact}" aria-hidden="true">
      <div class="rs-strength__track">${segs}</div>
      <strong class="rs-strength__pct">Not available</strong>
    </div>`;
  }

  if (strength.pct != null) {
    return strengthMeterHtml(strength.pct, opts);
  }

  const fill = 5;
  const segs = Array.from({ length: 10 }, (_, i) => {
    const on = i < fill ? " is-on" : "";
    return `<span class="rs-strength__seg${on}"></span>`;
  }).join("");

  return `<div class="rs-strength rs-strength--label rs-strength--estimated${compact}" aria-hidden="true">
    <div class="rs-strength__track">${segs}</div>
    <strong class="rs-strength__pct">Estimated</strong>
  </div>`;
}

/**
 * @param {{ pairLabel?: string, sentences: string[], strengthPct?: string | number, strengthDisplay?: StrengthDisplay, theme: string }} opts
 */
export function renderNarrativeHtml(opts) {
  const sentences = clampInsight(opts.sentences);
  let strengthInner = "";
  if (opts.strengthDisplay) {
    strengthInner = strengthDisplayHtml(opts.strengthDisplay);
  } else if (opts.strengthPct != null && opts.strengthPct !== "") {
    strengthInner = strengthMeterHtml(opts.strengthPct);
  }

  const strength = strengthInner
    ? `<div class="rs-narrative__meta-block rs-narrative__meta-block--strength">
      <span class="rs-narrative__meta-label">Relationship Strength</span>
      ${strengthInner}
    </div>`
    : "";

  const pair = opts.pairLabel
    ? `<p class="rs-narrative__pair">${opts.pairLabel}</p>`
    : "";

  const body = sentences
    .map((s, i) => `<p class="rs-narrative__line${i > 0 ? " rs-narrative__line--soft" : ""}">${s}</p>`)
    .join("");

  return `${pair}
    <div class="rs-narrative__insight">${body}</div>
    <div class="rs-narrative__meta">
      ${strength}
      <div class="rs-narrative__meta-block">
        <span class="rs-narrative__meta-label">Shared Theme</span>
        <strong class="rs-narrative__theme-val">${opts.theme}</strong>
      </div>
    </div>`;
}

/**
 * @param {{ sym: string, strengthPct?: number | null, strengthDisplay?: StrengthDisplay, theme: string }} opts
 */
export function renderCardMetricsHtml(opts) {
  const strengthInner = opts.strengthDisplay
    ? strengthDisplayHtml(opts.strengthDisplay, { compact: true })
    : strengthMeterHtml(opts.strengthPct ?? 0, { compact: true });

  const strengthBlock = `<div class="rs-card__metric rs-card__metric--stack">
          <span>Relationship Strength</span>
          ${strengthInner}
        </div>`;

  return `
    <div class="rs-card__metrics">
      ${strengthBlock}
      <div class="rs-card__metric">
        <span>Shared Theme</span>
        <strong class="rs-card__theme">${opts.theme}</strong>
      </div>
    </div>`;
}
