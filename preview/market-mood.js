/**
 * Plain-English market mood bands for the Market Risk gauge (preview).
 * @module preview/market-mood
 */

/** @typedef {{ id: string, emoji: string, face: string, label: string, blurb: string, probe: string, means: string[], why: string[] }} MarketMoodBand */

/** @type {MarketMoodBand} */
export const MOOD_COMFORTABLE = {
  id: "comfortable",
  emoji: "🟢",
  face: "😊",
  label: "Comfortable",
  blurb: "Investors are generally confident and willing to buy stocks.",
  probe: "Markets feel calm — investors are willing to hold stocks.",
  means: [
    "Markets are behaving normally.",
    "There are no major signs of stress right now.",
    "Technology and growth stocks can continue performing well if conditions remain stable.",
  ],
  why: ["Markets are calm", "Economic data is stable", "No major market shocks"],
};

/** @type {MarketMoodBand} */
export const MOOD_CAUTIOUS = {
  id: "cautious",
  emoji: "🟡",
  face: "😐",
  label: "Cautious",
  blurb: "Investors are becoming more careful and watching economic events closely.",
  probe: "Investors are watching closely — surprises could move prices quickly.",
  means: [
    "Markets are still functioning, but investors are paying extra attention.",
    "Upcoming news — such as inflation reports or central-bank comments — matters more than usual.",
    "It may be a good time to avoid oversized bets until the picture clears.",
  ],
  why: ["Headlines are picking up", "Prices are moving more than usual", "Investors are waiting for clarity"],
};

/** @type {MarketMoodBand} */
export const MOOD_DEFENSIVE = {
  id: "defensive",
  emoji: "🔴",
  face: "😟",
  label: "Defensive",
  blurb: "Investors are avoiding risk and moving money into safer investments.",
  probe: "Investors are playing it safe — riskier assets are under pressure.",
  means: [
    "Many investors are nervous and reducing risk.",
    "Safer areas — such as bonds and defensive stocks — may hold up better than fast-growing names.",
    "Sudden price swings are more likely until confidence returns.",
  ],
  why: ["Markets are unsettled", "Bad news is spreading quickly", "Investors are protecting their money"],
};

/** Reference copy for the optional “Why?” panel. */
export const MOOD_STATE_GUIDE = [
  { emoji: "🟢", label: "Comfortable", text: "Investors are confident and markets are functioning normally." },
  { emoji: "🟡", label: "Cautious", text: "Investors are becoming more careful and watching economic events closely." },
  { emoji: "🔴", label: "Defensive", text: "Investors are avoiding risk and moving money into safer investments." },
];

/**
 * Map a volatility-style score (e.g. VIX) to a beginner mood band.
 * @param {number} score
 * @returns {MarketMoodBand}
 */
export function marketMoodFromScore(score) {
  if (score < 18) return MOOD_COMFORTABLE;
  if (score < 26) return MOOD_CAUTIOUS;
  return MOOD_DEFENSIVE;
}
