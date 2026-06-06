/**
 * Options Story config and live summary builders (production).
 * @module lib/options-story-themes
 */

export const OPTIONS_STORY = {
  todayStory: {
    eyebrow: "Today's Options Story",
    defaultBody:
      "Preview narrative for Options Beta — live options flow coming soon. This sample summary shows how we'll surface call/put lean and notable names once flow is connected.",
  },
  overallPositioning: {
    title: "Overall Positioning",
    defaultLabel: "Slightly Bullish",
    defaultWhy:
      "Call activity remains ahead of put activity, though positioning is not extreme.",
  },
  flows: [
    {
      id: "bullish-flow",
      label: "Bullish Flow",
      headline: "Technology leaders",
      tone: "buy",
      keyNames: ["NVDA", "AMD", "SPY"],
      why: "Call buying is concentrated in technology leaders.",
      whyItMatters: "See which names are driving upside positioning before you read each print.",
      otab: "unusual",
      typeFilter: "CALL",
      sentimentFilter: "bullish",
    },
    {
      id: "bearish-flow",
      label: "Bearish Flow",
      headline: "Hedging & protection",
      tone: "sell",
      keyNames: ["QQQ", "IWM", "AAPL"],
      why: "Put activity has picked up in index and mega-cap hedges.",
      whyItMatters: "Helps tell routine hedging apart from directional bearish bets.",
      otab: "unusual",
      typeFilter: "PUT",
      sentimentFilter: "bearish",
    },
    {
      id: "unusual-activity",
      label: "Unusual Activity",
      headline: "Elevated volume",
      tone: "mixed",
      keyNames: ["NVDA", "TSLA", "META"],
      why: "Volume is running well above typical open interest in several names.",
      whyItMatters: "Worth checking timing and strike selection before treating any single print as a signal.",
      otab: "unusual",
    },
    {
      id: "largest-premium",
      label: "Largest Premium",
      headline: "NVDA block",
      tone: "buy",
      keyNames: ["NVDA"],
      why: "The largest premium print today landed in NVIDIA calls.",
      whyItMatters: "One large trade can stand out — compare its size to typical daily flow in that name.",
      otab: "unusual",
    },
  ],
};

/**
 * @param {string} premium
 */
export function parsePremiumValue(premium) {
  const s = String(premium || "0").replace(/[$,]/g, "");
  if (s.includes("M")) return parseFloat(s) * 1e6;
  if (s.includes("K")) return parseFloat(s) * 1e3;
  return parseFloat(s) || 0;
}

/**
 * @param {object[]} data
 */
export function buildTodayStorySummary(data) {
  const rows = data || [];
  if (!rows.length) return OPTIONS_STORY.todayStory.defaultBody;

  const calls = rows.filter((r) => r.type === "CALL");
  const puts = rows.filter((r) => r.type === "PUT");
  const lean =
    calls.length >= puts.length ? "cautiously bullish" : "more defensive";
  const callLead = calls.length >= puts.length ? "ahead of" : "behind";
  const syms = [...new Set(rows.map((r) => r.sym).filter(Boolean))].slice(0, 3);
  const names = syms.length ? syms.join(", ") : "large-cap names";

  return `Preview: flow looks ${lean}, with call activity ${callLead} puts. Sample highlights include ${names}. Live options flow coming soon.`;
}

/**
 * @param {object[]} data
 */
export function buildPositioningLabel(data) {
  const rows = data || [];
  if (!rows.length) return OPTIONS_STORY.overallPositioning.defaultLabel;

  const callVol = rows
    .filter((r) => r.type === "CALL")
    .reduce((s, r) => s + (r.volume || 0), 0);
  const putVol = rows
    .filter((r) => r.type === "PUT")
    .reduce((s, r) => s + (r.volume || 0), 0);
  const pcr = callVol > 0 ? putVol / callVol : 1;

  if (pcr < 0.75) return "Slightly Bullish";
  if (pcr > 1.05) return "Defensive";
  return "Neutral";
}

/**
 * @param {object[]} data
 */
export function buildPositioningWhy(data) {
  const rows = data || [];
  if (!rows.length) return OPTIONS_STORY.overallPositioning.defaultWhy;

  const callVol = rows
    .filter((r) => r.type === "CALL")
    .reduce((s, r) => s + (r.volume || 0), 0);
  const putVol = rows
    .filter((r) => r.type === "PUT")
    .reduce((s, r) => s + (r.volume || 0), 0);

  if (callVol > putVol * 1.1) {
    return "Call activity remains ahead of put activity, though positioning is not extreme.";
  }
  if (putVol > callVol * 1.1) {
    return "Put activity has picked up relative to calls, but readings are not at panic levels.";
  }
  return "Call and put activity are roughly balanced today.";
}

/**
 * @param {object} row
 * @param {import('./options-story-themes.js').OPTIONS_STORY['flows'][0]} flow
 * @param {object[]} allRows
 */
export function unusualRowMatchesFlow(row, flow, allRows = []) {
  if (!flow) return true;
  const sym = (row.sym || "").toUpperCase();
  const keys = (flow.keyNames || []).map((s) => s.toUpperCase());

  if (flow.id === "largest-premium" && allRows.length) {
    const top = [...allRows].sort(
      (a, b) => parsePremiumValue(b.premium) - parsePremiumValue(a.premium)
    )[0];
    if (top) return row.sym === top.sym && row.premium === top.premium;
  }

  if (flow.id === "unusual-activity") {
    const ratio = row.oi > 0 ? row.volume / row.oi : 0;
    return ratio >= 2.5 || keys.includes(sym);
  }

  if (keys.includes(sym)) return true;

  if (flow.id === "bullish-flow") {
    return row.type === "CALL" && row.sentiment === "bullish";
  }
  if (flow.id === "bearish-flow") {
    return row.type === "PUT" && row.sentiment === "bearish";
  }

  return false;
}
