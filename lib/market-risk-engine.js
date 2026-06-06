/**
 * Market Risk engine — single source of truth for regime classification and narratives.
 * Stress score 0–100: higher = more caution / risk-off pressure.
 * @module lib/market-risk-engine
 */

import { moodZoneById } from "/preview/market-mood.js";

const WEIGHTS = {
  vix: 0.4,
  breadth: 0.15,
  rates: 0.15,
  rotation: 0.15,
  news: 0.15,
};

/** @typedef {{ pctChange?: number, price?: number }} QuoteSnap */
/** @typedef {{ sym: string, name?: string, pct: number }} SectorSnap */
/** @typedef {{ dgs10?: number | null, dgs2?: number | null, dgs10Change?: number | null, dgs2Change?: number | null }} RatesSnap */

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {number | null | undefined} vix
 */
export function scoreVixComponent(vix) {
  if (vix == null || Number.isNaN(vix)) return { value: 50, detail: "VIX unavailable" };
  const value = clamp((vix - 12) * 4.2, 8, 95);
  return { value, detail: `VIX ${vix.toFixed(1)}` };
}

/**
 * @param {Record<string, QuoteSnap>} quotes
 */
export function scoreBreadthComponent(quotes) {
  const spy = quotes.SPY?.pctChange;
  const qqq = quotes.QQQ?.pctChange;
  const iwm = quotes.IWM?.pctChange;
  const nvda = quotes.NVDA?.pctChange;
  const inputs = [spy, qqq, iwm, nvda].filter((v) => v != null && !Number.isNaN(v));
  if (!inputs.length) return { value: 50, detail: "Breadth n/a", breadthNarrow: false };

  const losers = inputs.filter((v) => v < 0).length;
  const avg = inputs.reduce((a, b) => a + b, 0) / inputs.length;
  const breadthNarrow =
    spy != null &&
    iwm != null &&
    !Number.isNaN(spy) &&
    !Number.isNaN(iwm) &&
    spy - iwm > 0.2;
  const narrowPenalty = breadthNarrow ? 10 : 0;
  const breadthLosers = clamp((losers / inputs.length) * 100, 10, 90);
  const momentum = clamp(50 - avg * 14, 8, 92);
  const value = clamp((breadthLosers + momentum) / 2 + narrowPenalty, 8, 92);
  const breadthLabel = breadthNarrow ? "narrow" : avg > 0.15 ? "broadening" : "mixed";
  return {
    value,
    detail: `${losers}/${inputs.length} risk assets red · ${breadthLabel} breadth`,
    breadthNarrow,
  };
}

/**
 * @param {RatesSnap} rates
 */
export function scoreRatesComponent(rates) {
  const dgs10 = rates?.dgs10;
  if (dgs10 == null || Number.isNaN(dgs10)) {
    return { value: 50, detail: "10Y yield unavailable" };
  }
  let value = clamp(38 + (dgs10 - 4.0) * 22, 12, 88);
  const ch = rates.dgs10Change;
  if (ch != null && !Number.isNaN(ch)) {
    if (ch > 0.03) value += 8;
    else if (ch < -0.03) value -= 6;
  }
  const dgs2 = rates.dgs2;
  if (dgs2 != null && !Number.isNaN(dgs2) && dgs2 > dgs10 - 0.05) {
    value += 8;
  }
  value = clamp(value, 8, 92);
  const curve =
    dgs2 != null && !Number.isNaN(dgs2)
      ? dgs2 > dgs10
        ? "inverted"
        : "positive"
      : "n/a";
  return {
    value,
    detail: `10Y ${dgs10.toFixed(2)}%${ch != null ? ` (${ch >= 0 ? "+" : ""}${Math.round(ch * 100)} bp)` : ""} · 2Y/10Y ${curve}`,
  };
}

/**
 * @param {SectorSnap[]} sectors
 * @param {Record<string, QuoteSnap>} quotes
 */
export function scoreRotationComponent(sectors, quotes) {
  const pct = (sym) => {
    const fromSector = sectors?.find((s) => s.sym === sym);
    if (fromSector && !Number.isNaN(fromSector.pct)) return fromSector.pct;
    const q = quotes[sym];
    return q?.pctChange;
  };
  const xlk = pct("XLK");
  const xlu = pct("XLU");
  const qqq = quotes.QQQ?.pctChange;
  const nvda = quotes.NVDA?.pctChange;
  const growth = [qqq, nvda, xlk].filter((v) => v != null && !Number.isNaN(v));
  const growthAvg = growth.length ? growth.reduce((a, b) => a + b, 0) / growth.length : 0;
  const defensiveSpread = (xlu ?? 0) - (xlk ?? 0);
  const value = clamp(48 - growthAvg * 10 + defensiveSpread * 9, 8, 92);
  return {
    value,
    detail: `Growth vs defensives ${defensiveSpread >= 0 ? "+" : ""}${defensiveSpread.toFixed(2)}%`,
    topSector: pickTopSector(sectors),
  };
}

/**
 * @param {SectorSnap[]} sectors
 */
function pickTopSector(sectors) {
  if (!sectors?.length) return null;
  const sorted = [...sectors].filter((s) => !Number.isNaN(s.pct)).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return sorted[0] || null;
}

/**
 * Impact rows: [time, ago, severity, score, ...]
 * @param {unknown[]} impactItems
 */
export function scoreNewsComponent(impactItems) {
  if (!Array.isArray(impactItems) || !impactItems.length) {
    return { value: 32, detail: "No live news stress feed", newsHigh: false };
  }
  const high = impactItems.filter((i) => i[2] === "high").length;
  const med = impactItems.filter((i) => i[2] === "med").length;
  const value = clamp(high * 16 + med * 7, 20, 82);
  return {
    value,
    detail: `${high} high · ${med} medium severity headlines`,
    newsHigh: high >= 2,
  };
}

/**
 * @param {number} stressScore
 */
export function classifyRegimeLabel(stressScore) {
  if (stressScore <= 30) return "Risk-On";
  if (stressScore <= 42) return "Neutral";
  if (stressScore <= 58) return "Neutral → Cautious";
  return "Risk-Off";
}

/**
 * @param {string} label
 */
export function regimeClassFromLabel(label) {
  if (label === "Risk-On") return "on";
  if (label === "Risk-Off") return "off";
  if (label.includes("Cautious")) return "cautious";
  return "mixed";
}

/**
 * Map composite stress to gauge arc (VIX-scale for existing SVG).
 * @param {number} stressScore
 */
export function stressToGaugeVix(stressScore) {
  return 10 + (stressScore / 100) * 22;
}

/**
 * @param {string} label
 * @param {number} stressScore
 */
export function moodIdFromRegime(label, stressScore) {
  if (label === "Risk-On") return stressScore < 18 ? "optimistic" : "comfortable";
  if (label === "Neutral") return "neutral";
  if (label === "Neutral → Cautious") return "cautious";
  return "fear";
}

/**
 * @param {object} p
 * @param {number | null} p.vix
 * @param {Record<string, QuoteSnap>} p.quotes
 * @param {SectorSnap[]} [p.sectors]
 * @param {RatesSnap} [p.rates]
 * @param {unknown[]} [p.impactItems]
 */
export function computeMarketRisk({ vix, quotes = {}, sectors = [], rates = {}, impactItems = [] }) {
  const vixC = scoreVixComponent(vix);
  const breadthC = scoreBreadthComponent(quotes);
  const ratesC = scoreRatesComponent(rates);
  const rotationC = scoreRotationComponent(sectors, quotes);
  const newsC = scoreNewsComponent(impactItems);

  const components = [
    { name: "Volatility", ...vixC, weight: WEIGHTS.vix },
    { name: "Breadth", value: breadthC.value, detail: breadthC.detail, weight: WEIGHTS.breadth },
    { name: "Rates", value: ratesC.value, detail: ratesC.detail, weight: WEIGHTS.rates },
    {
      name: "Rotation",
      value: rotationC.value,
      detail: rotationC.detail,
      weight: WEIGHTS.rotation,
    },
    { name: "News", value: newsC.value, detail: newsC.detail, weight: WEIGHTS.news },
  ];

  const score = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0) /
      components.reduce((sum, c) => sum + c.weight, 0)
  );

  const label = classifyRegimeLabel(score);
  const regimeCls = regimeClassFromLabel(label);
  const moodId = moodIdFromRegime(label, score);
  const mood = moodZoneById(moodId);

  const agreeing = components.filter((c) =>
    score >= 50 ? c.value >= 52 : c.value <= 48
  ).length;
  const confidence = agreeing >= 4 ? "High" : agreeing >= 3 ? "Medium" : "Low";
  const confidencePct = confidence === "High" ? 84 : confidence === "Low" ? 36 : 62;

  const narrative = buildStructuredNarrative({
    label,
    score,
    quotes,
    vix,
    rates,
    breadthNarrow: breadthC.breadthNarrow,
    topSector: rotationC.topSector,
    newsHigh: newsC.newsHigh,
    components,
  });

  return {
    score,
    label,
    regimeShort: label.replace(" → Cautious", "").replace(" Tilt", ""),
    regimeCls,
    moodId,
    mood,
    gaugeVix: stressToGaugeVix(score),
    components,
    confidence,
    confidencePct,
    signalAgreement: agreeing,
    breadthNarrow: breadthC.breadthNarrow,
    narrative,
    quotes: { ...quotes },
    vix,
    rates: { ...rates },
    updatedAt: Date.now(),
  };
}

/**
 * @param {object} p
 */
function buildStructuredNarrative(p) {
  const fmtSym = (sym) => {
    const q = p.quotes?.[sym];
    if (!q || q.pctChange == null || Number.isNaN(q.pctChange)) return null;
    const sign = q.pctChange >= 0 ? "+" : "";
    return `${sym} ${sign}${q.pctChange.toFixed(2)}%`;
  };

  const indexParts = [fmtSym("SPY"), fmtSym("QQQ"), fmtSym("IWM")].filter(Boolean);
  let whatChanged = indexParts.length
    ? `Major indices: ${indexParts.join(", ")}. `
    : "Live index quotes are still loading. ";

  if (p.vix != null && !Number.isNaN(p.vix)) {
    whatChanged += `VIX is ${p.vix.toFixed(1)}. `;
  }
  if (p.rates?.dgs10 != null) {
    const ch = p.rates.dgs10Change;
    const chTxt =
      ch != null && !Number.isNaN(ch)
        ? ` (${ch >= 0 ? "+" : ""}${(ch * 100).toFixed(0)} bp vs prior)`
        : "";
    whatChanged += `10Y Treasury ${p.rates.dgs10.toFixed(2)}%${chTxt}. `;
  }
  if (p.rates?.dgs2 != null) {
    whatChanged += `2Y at ${p.rates.dgs2.toFixed(2)}%. `;
  }
  if (p.topSector?.name) {
    const sign = p.topSector.pct >= 0 ? "+" : "";
    whatChanged += `${p.topSector.name} is leading sector moves (${sign}${p.topSector.pct.toFixed(2)}%).`;
  }

  let whyItMatters;
  if (p.label === "Risk-Off") {
    whyItMatters =
      "Defensive positioning and macro pressure are showing up across rates, breadth, or headlines. Sudden data surprises can move prices quickly when investors are already cautious.";
  } else if (p.label === "Neutral → Cautious") {
    whyItMatters =
      "Volatility may look calm while yields stay elevated and leadership stays narrow. Growth and duration-sensitive names can still face pressure even when the headline index looks stable.";
  } else if (p.label === "Risk-On") {
    whyItMatters =
      "Risk appetite is holding, but concentrated leadership and macro headlines can still reverse sentiment without much warning.";
  } else {
    whyItMatters =
      "Indices, breadth, and rates are not fully aligned — the surface read can hide rotation underneath.";
  }

  const watch = [];
  watch.push("VIX and Treasury yields (2Y / 10Y)");
  if (p.breadthNarrow) {
    watch.push("Whether small caps and mid-caps catch up to mega-cap leaders");
  } else {
    watch.push("Sector leadership and market breadth");
  }
  if (p.newsHigh) {
    watch.push("High-severity headlines in the live news stress feed");
  } else {
    watch.push("Upcoming macro calendar and Fed commentary");
  }
  if (p.quotes?.NVDA?.pctChange != null) {
    watch.push("AI / mega-cap leadership follow-through");
  }

  let pulseLine;
  if (p.label === "Risk-On") pulseLine = "Risk appetite firm";
  else if (p.label === "Risk-Off") pulseLine = "Defensive tone on tape";
  else if (p.label === "Neutral → Cautious") pulseLine = "Cautious · watch yields & breadth";
  else pulseLine = "Mixed session · read breadth carefully";

  let headline;
  if (p.label === "Risk-On" && p.breadthNarrow) headline = "Leaders carry a narrow tape";
  else if (p.label === "Risk-On") headline = "Risk appetite holds";
  else if (p.label === "Risk-Off") headline = "Defensive pressure builds";
  else if (p.label === "Neutral → Cautious") headline = "Calm vol, cautious undertone";
  else headline = "A mixed, selective session";

  const strongest = [...p.components].sort((a, b) => b.value - a.value)[0];
  const calmest = [...p.components].sort((a, b) => a.value - b.value)[0];
  const explanation = `<b>BriefTick read:</b> ${p.label}. ${strongest.name} is the strongest caution signal (${Math.round(strongest.value)}/100: ${strongest.detail}), while ${calmest.name} is the least stressed (${Math.round(calmest.value)}/100). Live context score — not a forecast.`;

  return {
    whatChanged: whatChanged.trim(),
    whyItMatters,
    whatToWatch: watch,
    pulseLine,
    headline,
    summary: moodZoneById(moodIdFromRegime(p.label, p.score)).summary,
    plainEnglish: moodZoneById(moodIdFromRegime(p.label, p.score)).plainEnglish,
    explanation,
  };
}

/**
 * @returns {import('./market-risk-engine.js').computeMarketRisk extends Function ? ReturnType<typeof computeMarketRisk> : never}
 */
export function createInitialRiskState() {
  return computeMarketRisk({
    vix: null,
    quotes: {},
    sectors: [],
    rates: {},
    impactItems: [],
  });
}
