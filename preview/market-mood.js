/**
 * Plain-English market mood bands for the Market Risk gauge (preview).
 * @module preview/market-mood
 */

/**
 * @typedef {Object} MoodZone
 * @property {string} id
 * @property {string} label
 * @property {string} emoji
 * @property {string} face
 * @property {number} vixAnchor — default VIX when zone is tapped
 * @property {string} color — arc marker colour
 * @property {string} confidence — High | Medium | Low
 * @property {string} plainEnglish
 * @property {string} summary — one-line live summary for beginners
 * @property {string[]} usuallyMeans
 * @property {string[]} investorsDo
 * @property {string[]} why
 * @property {string} probe
 * @property {string} zoneTip — short line on zone hover
 */

/** @type {MoodZone[]} Left (calm) → right (stressed) on the gauge arc. */
export const MOOD_ZONES = [
  {
    id: "optimistic",
    label: "Optimistic",
    emoji: "🟢",
    face: "",
    vixAnchor: 11,
    color: "#3ddc97",
    confidence: "High",
    plainEnglish:
      "Investors are upbeat. Money is flowing into stocks and few people expect a sharp drop soon.",
    summary:
      "Investors are upbeat and money is flowing into stocks with few signs of a sharp drop ahead.",
    usuallyMeans: [
      "Investors are generally buying rather than selling.",
      "Growth and technology stocks often lead the market.",
      "Market volatility is usually low in this mood.",
      "Good news can push prices higher quickly.",
    ],
    investorsDo: [
      "Long-term investors often stay invested.",
      "Traders may look for opportunities in stronger sectors.",
      "Risk management remains important.",
    ],
    why: ["Earnings are solid", "Volatility is low", "Investors are willing to take risk"],
    probe: "Optimistic mood — markets feel upbeat and risk appetite is healthy.",
    zoneTip: "Optimistic: investors expect stocks to keep doing well.",
  },
  {
    id: "comfortable",
    label: "Comfortable",
    emoji: "🟢",
    face: "",
    vixAnchor: 14,
    color: "#5ee4ad",
    confidence: "High",
    plainEnglish:
      "Investors are feeling confident. Money is flowing into stocks and there are currently few signs of market stress.",
    summary:
      "Investors feel confident and are putting money into stocks with little sign of stress today.",
    usuallyMeans: [
      "Investors are generally buying rather than selling.",
      "Growth stocks may continue performing well.",
      "Market volatility is currently low.",
      "Conditions can change quickly if major news arrives.",
    ],
    investorsDo: [
      "Long-term investors often stay invested.",
      "Traders may look for opportunities in stronger sectors.",
      "Risk management remains important.",
    ],
    why: ["Markets are calm", "Economic data is stable", "No major market shocks"],
    probe: "Comfortable mood — markets feel calm and investors are willing to hold stocks.",
    zoneTip: "Comfortable: calm markets with steady buying.",
  },
  {
    id: "neutral",
    label: "Neutral",
    emoji: "⚪",
    face: "",
    vixAnchor: 20,
    color: "#e8c178",
    confidence: "Medium",
    plainEnglish:
      "Investors are neither very worried nor very excited. Markets are waiting for the next big piece of news.",
    summary: "Investors are balanced and waiting for the next major catalyst.",
    usuallyMeans: [
      "Prices can move in either direction without a clear trend.",
      "Investors watch inflation, jobs data, and central-bank comments closely.",
      "Some sectors may rise while others fall.",
      "Volatility can pick up without much warning.",
    ],
    investorsDo: [
      "Many investors hold their current positions and wait for clarity.",
      "Some reduce position sizes until the outlook is clearer.",
      "Diversification across sectors is often discussed in this mood.",
    ],
    why: ["Mixed economic signals", "Investors are undecided", "Headlines matter more than usual"],
    probe: "Neutral mood — investors are balanced and watching for the next catalyst.",
    zoneTip: "Neutral: markets are in wait-and-see mode.",
  },
  {
    id: "cautious",
    label: "Cautious",
    emoji: "🟡",
    face: "😐",
    vixAnchor: 24,
    color: "#e8c178",
    confidence: "Medium",
    plainEnglish:
      "Investors are becoming more careful. They worry that bad news could cause sudden price drops.",
    summary:
      "Investors are uneasy and watching closely because bad news could move prices quickly.",
    usuallyMeans: [
      "Investors buy less aggressively than before.",
      "Safer assets such as bonds may attract more interest.",
      "Price swings can become larger on headlines.",
      "Upcoming economic reports carry extra weight.",
    ],
    investorsDo: [
      "Some investors shift toward safer holdings.",
      "Traders may use smaller positions or tighter risk limits.",
      "Long-term investors often review their plan rather than panic.",
    ],
    why: ["Headlines are picking up", "Prices are moving more than usual", "Investors want clarity"],
    probe: "Cautious mood — surprises could move prices quickly.",
    zoneTip: "Cautious: investors are careful and watching closely.",
  },
  {
    id: "fear",
    label: "Fear",
    emoji: "🔴",
    face: "😟",
    vixAnchor: 29,
    color: "#ff5b6e",
    confidence: "Low",
    plainEnglish:
      "Investors are worried. Many are selling riskier assets and moving money toward safer places.",
    summary:
      "Investors are nervous and moving money away from riskier investments toward safer places.",
    usuallyMeans: [
      "Stock prices can fall quickly on bad news.",
      "Volatility is usually high — prices swing more than normal.",
      "Defensive sectors may hold up better than fast-growing stocks.",
      "Confidence can return slowly after the fear fades.",
    ],
    investorsDo: [
      "Some investors reduce stock exposure temporarily.",
      "Others focus on cash, bonds, or defensive sectors.",
      "Experienced investors often stick to a long-term plan despite stress.",
    ],
    why: ["Markets are unsettled", "Bad news spreads quickly", "Investors are protecting their money"],
    probe: "Fear mood — riskier assets are under pressure.",
    zoneTip: "Fear: investors are avoiding risk and protecting capital.",
  },
];

/** @type {Record<string, MoodZone>} */
const ZONE_BY_ID = Object.fromEntries(MOOD_ZONES.map((z) => [z.id, z]));

/** Reference copy for the optional “Why?” panel. */
export const MOOD_STATE_GUIDE = MOOD_ZONES.map((z) => ({
  emoji: z.emoji,
  label: z.label,
  text: z.plainEnglish,
}));

/** Beginner intro — what the Market Risk section measures. */
export const MARKET_RISK_ABOUT =
  "This section measures how comfortable or nervous investors currently feel. It combines market volatility, sentiment, money flows, and risk appetite to estimate the overall mood of the market.";

export const GAUGE_VIX_MIN = 10;
export const GAUGE_VIX_MAX = 32;

/** SVG gauge centre (viewBox 0 0 200 120) — matches arc path. */
export const GAUGE_CX = 100;
export const GAUGE_CY = 100;
export const GAUGE_RADIUS = 76;
/** Needle stops short of the arc so the tip sits under the marker. */
const GAUGE_NEEDLE_INSET = 10;

/**
 * Normalised position along the upper semicircle (0 = calm/left, 1 = fear/right).
 * @param {number} vix
 */
export function gaugeArcT(vix) {
  const t = (vix - GAUGE_VIX_MIN) / (GAUGE_VIX_MAX - GAUGE_VIX_MIN);
  return Math.max(0, Math.min(1, t));
}

/**
 * Angle (radians, atan2 convention) on the upper arc for a VIX value.
 * @param {number} vix
 */
export function gaugeArcAngleRad(vix) {
  const t = gaugeArcT(vix);
  if (t <= 0.5) {
    return Math.PI + t * Math.PI;
  }
  return -Math.PI / 2 + (t - 0.5) * Math.PI;
}

/**
 * Shared geometry for marker + needle (single angle source).
 * @param {number} vix
 * @returns {{ angleRad: number, markerX: number, markerY: number, needleX1: number, needleY1: number, needleX2: number, needleY2: number }}
 */
export function gaugeArcGeometry(vix) {
  const angleRad = gaugeArcAngleRad(vix);
  const needleLen = GAUGE_RADIUS - GAUGE_NEEDLE_INSET;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    angleRad,
    markerX: GAUGE_CX + GAUGE_RADIUS * cos,
    markerY: GAUGE_CY + GAUGE_RADIUS * sin,
    needleX1: GAUGE_CX,
    needleY1: GAUGE_CY,
    needleX2: GAUGE_CX + needleLen * cos,
    needleY2: GAUGE_CY + needleLen * sin,
  };
}

/**
 * Map pointer angle (atan2) back to VIX on the upper arc.
 * @param {number} angleRad
 */
export function vixFromArcAngleRad(angleRad) {
  const a = angleRad;
  if (a >= -Math.PI / 2 && a <= 0) {
    const t = 0.5 + ((a + Math.PI / 2) / (Math.PI / 2)) * 0.5;
    return GAUGE_VIX_MIN + t * (GAUGE_VIX_MAX - GAUGE_VIX_MIN);
  }
  if (a >= Math.PI && a <= (3 * Math.PI) / 2) {
    const t = ((a - Math.PI) / (Math.PI / 2)) * 0.5;
    return GAUGE_VIX_MIN + Math.max(0, Math.min(0.5, t)) * (GAUGE_VIX_MAX - GAUGE_VIX_MIN);
  }
  if (a < 0 && a >= -Math.PI) {
    const t = ((a + Math.PI) / (Math.PI / 2)) * 0.5;
    return GAUGE_VIX_MIN + Math.max(0, Math.min(0.5, t)) * (GAUGE_VIX_MAX - GAUGE_VIX_MIN);
  }
  if (a > 0 && a < Math.PI / 2) {
    return a > Math.PI / 4
      ? GAUGE_VIX_MAX
      : GAUGE_VIX_MIN + 0.5 * (GAUGE_VIX_MAX - GAUGE_VIX_MIN);
  }
  return a > 0 ? GAUGE_VIX_MAX : GAUGE_VIX_MIN;
}

/**
 * @param {number} vix
 * @returns {MoodZone}
 */
export function moodZoneFromVix(vix) {
  if (vix < 13) return ZONE_BY_ID.optimistic;
  if (vix < 18) return ZONE_BY_ID.comfortable;
  if (vix < 22) return ZONE_BY_ID.neutral;
  if (vix < 26) return ZONE_BY_ID.cautious;
  return ZONE_BY_ID.fear;
}

/**
 * @param {string} id
 * @returns {MoodZone}
 */
export function moodZoneById(id) {
  return ZONE_BY_ID[id] || ZONE_BY_ID.comfortable;
}

/**
 * Beginner-friendly 0–100 risk score (low = calmer markets).
 * @param {number} vix
 */
export function vixToRiskScorePercent(vix) {
  const t = gaugeArcT(vix);
  return Math.round(t * 1000) / 10;
}

/** @deprecated Use gaugeArcGeometry — SVG rotate degrees from default “up” needle. */
export function vixToGaugeAngle(vix) {
  const { angleRad } = gaugeArcGeometry(vix);
  return ((angleRad + Math.PI / 2) * 180) / Math.PI;
}

/** @deprecated Use gaugeArcGeometry */
export function gaugeMarkerPosition(vix) {
  const g = gaugeArcGeometry(vix);
  return { x: g.markerX, y: g.markerY };
}

/** @param {number} score @returns {MoodZone} */
export function marketMoodFromScore(score) {
  return moodZoneFromVix(score);
}

/** Legacy export — comfortable band. */
export const MOOD_COMFORTABLE = ZONE_BY_ID.comfortable;
export const MOOD_CAUTIOUS = ZONE_BY_ID.cautious;
export const MOOD_DEFENSIVE = ZONE_BY_ID.fear;
