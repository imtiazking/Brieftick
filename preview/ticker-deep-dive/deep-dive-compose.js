/**
 * Compose Overview + Drivers from Deep Dive bundle (Phase A).
 * @module preview/ticker-deep-dive/deep-dive-compose
 */

/** @typedef {import('./deep-dive-bundle.js').DeepDiveBundle} DeepDiveBundle */
/** @typedef {import('./deep-dive-bundle.js').DeepDiveProvenance} DeepDiveProvenance */
/** @typedef {import('./ticker-meta.js').SectorTemplateKey} SectorTemplateKey */

/**
 * @typedef {Object} ComposedDeepDiveIntel
 * @property {string} name
 * @property {string} summaryHtml
 * @property {[string, string, string][]} reasons
 * @property {string} chgColor
 * @property {string} price
 * @property {string} chg
 * @property {number} trend
 * @property {DeepDiveProvenance} provenance
 */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {number|null|undefined} pct
 */
function fmtPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * @param {DeepDiveBundle} bundle
 */
function earningsPhrase(bundle) {
  const e = bundle.earnings;
  if (!e?.date) return null;
  const d = e.daysUntil;
  if (d == null) return `The next earnings date on file is <b>${esc(e.date)}</b>.`;
  if (d === 0) return `<b>Earnings are scheduled for today</b>${e.hour ? ` (${esc(e.hour)})` : ""}.`;
  if (d > 0 && d <= 14)
    return `<b>Earnings are ${d} session${d === 1 ? "" : "s"} away</b> (${esc(e.date)}).`;
  if (d < 0 && d >= -5)
    return `The stock <b>reported ${Math.abs(d)} session${Math.abs(d) === 1 ? "" : "s"} ago</b> — guidance may still be in focus.`;
  if (d < -5) return null;
  return `Next earnings: <b>${esc(e.date)}</b> (not in the immediate window).`;
}

/**
 * @param {DeepDiveBundle} bundle
 */
function sectorPhrase(bundle) {
  const row =
    bundle.primarySector ||
    bundle.sectorMoves.find((r) => r.sym === bundle.meta.sectorEtf) ||
    bundle.sectorMoves[0];
  if (!row || row.pct == null) {
    return `${esc(bundle.meta.sectorLabel)} is the primary sector framing; sector ETF data was unavailable.`;
  }
  const pct = fmtPct(row.pct);
  const dir = row.pct >= 0.35 ? "outperforming" : row.pct <= -0.35 ? "under pressure" : "mixed";
  return `<b>${esc(row.label)} (${esc(row.sym)})</b> is ${dir} today at <b>${pct}</b>, which shapes how investors read ${esc(bundle.sym)} as a ${esc(bundle.meta.sectorLabel.toLowerCase())} name.`;
}

/**
 * @param {DeepDiveBundle} bundle
 */
function macroPhrase(bundle) {
  const parts = [];
  if (bundle.macro?.regime) parts.push(`Risk regime: <b>${esc(bundle.macro.regime)}</b>`);
  if (bundle.macro?.vixLabel) parts.push(`VIX context: <b>${esc(bundle.macro.vixLabel)}</b>`);
  const xlk = bundle.sectorMoves.find((r) => r.sym === "XLK");
  const xlf = bundle.sectorMoves.find((r) => r.sym === "XLF");
  if (xlk?.pct != null && xlf?.pct != null) {
    const spread = xlk.pct - xlf.pct;
    if (spread > 0.8)
      parts.push("Growth/tech is leading financials on the tape — typical risk-on sector rotation.");
    else if (spread < -0.8)
      parts.push("Financials are holding up better than tech — investors may be fading long-duration growth.");
  }
  if (!parts.length) return null;
  return parts.join(" ");
}

/**
 * @param {SectorTemplateKey} template
 * @param {DeepDiveBundle} bundle
 */
function sectorFallbackOverview(template, bundle) {
  const sym = bundle.sym;
  const sector = bundle.meta.sectorLabel;
  const map = {
    financials: `${sym} is trading on <b>rates and financial-sector tone</b> today. Banks and lenders tend to respond to yield-curve moves, credit headlines, and rotation between growth and value — not datacentre capex narratives.`,
    energy: `${sym} is trading on <b>commodity and energy-sector tone</b> today. Crude direction, OPEC/supply headlines, and inflation read-through usually matter more than single-stock tech catalysts.`,
    healthcare: `${sym} is trading on <b>healthcare-sector tone</b> today — reimbursement, pipeline headlines, and defensive rotation often dominate when macro volatility rises.`,
    industrials: `${sym} is trading on <b>industrial and cyclical tone</b> today. PMI, freight, and capex-cycle sentiment typically drive the group.`,
    ev: `${sym} is trading on <b>EV and consumer-discretionary tone</b> today — demand data, margin narrative, and high-beta risk appetite matter.`,
    semis: `${sym} is trading on <b>semiconductor-sector tone</b> today. Equipment demand, memory pricing, and peer sympathy often move the group together.`,
    software: `${sym} is trading on <b>technology and software-sector tone</b> today. Rates, cloud spending, and mega-cap correlation are common channels.`,
    general: `${sym} is trading with <b>broad market tone</b> today. Without a dominant company headline, sector and macro flows often explain most of the session move.`,
  };
  return map[template] || map.general;
}

/**
 * @param {DeepDiveBundle} bundle
 * @returns {string}
 */
export function composeOverviewHtml(bundle) {
  const sym = bundle.sym;
  const pct = bundle.quote?.pctChange;
  const moveDir =
    pct == null
      ? "in focus"
      : pct >= 0.5
        ? "higher"
        : pct <= -0.5
          ? "lower"
          : "little changed";
  const movePct = pct != null ? fmtPct(pct) : null;

  const headline = bundle.companyNews[0]?.headline;
  const parts = [];

  if (headline) {
    parts.push(
      `<b>${esc(sym)}</b> is ${moveDir} today${movePct ? ` (<b>${movePct}</b>)` : ""} with attention on <b>${esc(headline)}</b>.`
    );
    const summary = bundle.companyNews[0]?.summary;
    if (summary) {
      const clip = summary.length > 220 ? summary.slice(0, 217) + "…" : summary;
      parts.push(esc(clip));
    }
  } else {
    parts.push(
      movePct
        ? `<b>${esc(sym)}</b> is ${moveDir} today (<b>${movePct}</b>). ${sectorFallbackOverview(bundle.meta.sectorTemplate, bundle)}`
        : `<b>${esc(sym)}</b> is ${moveDir} today. ${sectorFallbackOverview(bundle.meta.sectorTemplate, bundle)}`
    );
  }

  const earn = earningsPhrase(bundle);
  if (earn) parts.push(earn);

  parts.push(sectorPhrase(bundle));

  const macro = macroPhrase(bundle);
  if (macro) parts.push(macro);

  parts.push(
    "This overview is built from live or cached market inputs — context only, not a forecast."
  );

  return parts.join(" ");
}

/**
 * @typedef {{ id: string, title: string, desc: string, weight: number }} DriverSlot
 */

/**
 * @param {SectorTemplateKey} template
 * @returns {DriverSlot[]}
 */
function baseDriverSlots(template) {
  const slots = {
    financials: [
      {
        id: "nim",
        title: "Net interest margin / yield curve",
        desc: "Curve shape and rate expectations feed through to lending margins and bank earnings power.",
        weight: 35,
      },
      {
        id: "credit",
        title: "Credit quality & loan growth",
        desc: "Credit spreads and loan-demand headlines drive risk appetite for money-center banks.",
        weight: 25,
      },
      {
        id: "rotation",
        title: "Sector rotation vs growth",
        desc: "Flows between growth and value often move XLF independently of a single bank headline.",
        weight: 20,
      },
      {
        id: "reg",
        title: "Regulation / capital return",
        desc: "Stress-test, buyback, and regulatory headlines can shift the group quickly.",
        weight: 12,
      },
      {
        id: "technical",
        title: "Technical / positioning",
        desc: "Index weighting and systematic flows can amplify moves on light catalyst days.",
        weight: 8,
      },
    ],
    energy: [
      {
        id: "crude",
        title: "Crude & supply narrative",
        desc: "Oil price, OPEC commentary, and inventory data are the primary read-through for E&P names.",
        weight: 38,
      },
      {
        id: "refining",
        title: "Refining / downstream margins",
        desc: "Crack spreads and utilization shape earnings expectations for integrated majors.",
        weight: 22,
      },
      {
        id: "macro",
        title: "Dollar & rates cross-current",
        desc: "A stronger dollar or higher real yields can pressure commodities even when supply is tight.",
        weight: 18,
      },
      {
        id: "beta",
        title: "Equity beta / risk tone",
        desc: "Energy can trade as a cyclical beta sleeve when broad risk appetite shifts.",
        weight: 14,
      },
      {
        id: "technical",
        title: "ETF & commodity flows",
        desc: "XLE and crude-linked ETF flows can move the group on positioning days.",
        weight: 8,
      },
    ],
    semis: [
      {
        id: "capex",
        title: "AI / datacentre demand tone",
        desc: "Hyperscaler and equipment demand headlines drive the semiconductor complex.",
        weight: 34,
      },
      {
        id: "rates",
        title: "Rates & duration pressure",
        desc: "Higher yields can compress multiples on long-duration growth semis.",
        weight: 22,
      },
      {
        id: "sympathy",
        title: "Peer sympathy chain",
        desc: "Correlated semis often move together when a bellwether breaks a key level.",
        weight: 20,
      },
      {
        id: "cycle",
        title: "Inventory / cycle data",
        desc: "Memory pricing and order commentary can dominate when macro is quiet.",
        weight: 16,
      },
      {
        id: "technical",
        title: "Technical / flow",
        desc: "SOXX/QQQ correlation and systematic selling can extend moves.",
        weight: 8,
      },
    ],
    ev: [
      {
        id: "demand",
        title: "Demand & delivery narrative",
        desc: "Registration data, delivery estimates, and pricing drive the EV complex.",
        weight: 36,
      },
      {
        id: "margin",
        title: "Margin / pricing pressure",
        desc: "Price-cut and margin commentary reset earnings expectations quickly.",
        weight: 22,
      },
      {
        id: "risk",
        title: "Risk appetite / high beta",
        desc: "EV leaders often amplify broader growth risk-on or risk-off sessions.",
        weight: 20,
      },
      {
        id: "rates",
        title: "Rates sensitivity",
        desc: "Long-duration growth names can de-rate when yields rise.",
        weight: 14,
      },
      {
        id: "technical",
        title: "Technical / options",
        desc: "Gamma and momentum levels can add to intraday volatility.",
        weight: 8,
      },
    ],
    software: [
      {
        id: "growth",
        title: "Cloud / software growth tone",
        desc: "Enterprise spending and cloud commentary shape mega-cap tech.",
        weight: 32,
      },
      {
        id: "rates",
        title: "Rates & multiple compression",
        desc: "Yield moves mechanically affect long-duration software valuations.",
        weight: 24,
      },
      {
        id: "ai",
        title: "AI monetization narrative",
        desc: "AI product and capex headlines can move platforms and infrastructure together.",
        weight: 20,
      },
      {
        id: "ads",
        title: "Ad / consumer demand",
        desc: "Digital ad and consumer spend data matter for platform names.",
        weight: 16,
      },
      {
        id: "technical",
        title: "Index correlation",
        desc: "QQQ weighting and factor flows often dominate on quiet headline days.",
        weight: 8,
      },
    ],
    healthcare: [
      {
        id: "pipeline",
        title: "Pipeline / FDA headlines",
        desc: "Trial data and approval paths drive single-name biotech and pharma moves.",
        weight: 30,
      },
      {
        id: "reimburse",
        title: "Reimbursement / policy",
        desc: "Policy headlines can shift the whole healthcare complex.",
        weight: 24,
      },
      {
        id: "defensive",
        title: "Defensive rotation",
        desc: "XLV often bids when investors seek quality and lower beta.",
        weight: 22,
      },
      {
        id: "rates",
        title: "Rates on growth biotech",
        desc: "Long-duration biotech can trade with yields when macro leads.",
        weight: 16,
      },
      {
        id: "technical",
        title: "Technical / ETF flows",
        desc: "Healthcare ETF flows can move leaders on low-news sessions.",
        weight: 8,
      },
    ],
    industrials: [
      {
        id: "pmi",
        title: "PMI / capex cycle",
        desc: "Manufacturing surveys and capex intentions drive industrial sentiment.",
        weight: 34,
      },
      {
        id: "freight",
        title: "Freight & logistics",
        desc: "Transport data is a leading indicator for industrial demand.",
        weight: 22,
      },
      {
        id: "china",
        title: "China / export tone",
        desc: "Export and geopolitical headlines affect machinery and transport.",
        weight: 20,
      },
      {
        id: "rates",
        title: "Rates on cyclicals",
        desc: "Higher rates can weigh on capex-sensitive cyclicals.",
        weight: 16,
      },
      {
        id: "technical",
        title: "Technical / XLI flows",
        desc: "Industrial ETF positioning can amplify sector moves.",
        weight: 8,
      },
    ],
    general: [
      {
        id: "headline",
        title: "Headline / company catalyst",
        desc: "When a company-specific headline is present, it usually dominates the session story.",
        weight: 30,
      },
      {
        id: "sector",
        title: "Sector beta",
        desc: "Sector ETF performance provides the baseline read-through for single stocks.",
        weight: 28,
      },
      {
        id: "macro",
        title: "Macro & rates tone",
        desc: "Rates, dollar, and risk regime shape broad equity moves.",
        weight: 22,
      },
      {
        id: "earnings",
        title: "Earnings calendar",
        desc: "Proximity to earnings can elevate volatility even without a fresh headline.",
        weight: 12,
      },
      {
        id: "technical",
        title: "Technical / flow",
        desc: "Index rebalancing and systematic strategies can move price on quiet days.",
        weight: 8,
      },
    ],
  };
  return [...(slots[template] || slots.general)];
}

/**
 * @param {DriverSlot[]} slots
 */
function normalizeWeights(slots) {
  const total = slots.reduce((s, x) => s + x.weight, 0) || 100;
  return slots.map((s) => ({
    ...s,
    weight: Math.max(5, Math.round((s.weight / total) * 100)),
  }));
}

/**
 * @param {DeepDiveBundle} bundle
 * @returns {[string, string, string][]}
 */
export function composeDrivers(bundle) {
  const template = bundle.meta.sectorTemplate;
  let slots = baseDriverSlots(template);
  const headline = bundle.companyNews[0]?.headline;
  const sectorPct = bundle.primarySector?.pct ?? bundle.sectorMoves[0]?.pct;
  const earn = bundle.earnings;

  if (headline) {
    const headSlot = slots.find((s) => s.id === "headline" || s.id === "capex" || s.id === "crude" || s.id === "nim" || s.id === "demand");
    const target = headSlot || slots[0];
    target.title = "Company headline";
    target.desc = headline.length > 200 ? headline.slice(0, 197) + "…" : headline;
    target.weight += 12;
  }

  if (sectorPct != null && Math.abs(sectorPct) >= 0.5) {
    const rot = slots.find((s) => s.id === "rotation" || s.id === "sector" || s.id === "beta" || s.id === "sympathy");
    if (rot) {
      rot.weight += 8;
      rot.desc = `${bundle.meta.sectorEtf} ${fmtPct(sectorPct)} today — ${rot.desc}`;
    }
  }

  if (earn && earn.daysUntil != null && earn.daysUntil >= 0 && earn.daysUntil <= 14) {
    const eSlot = slots.find((s) => s.id === "earnings" || s.id === "reg");
    if (eSlot) {
      eSlot.weight += 10;
      eSlot.title = "Earnings proximity";
      eSlot.desc = `Reports ${earn.date} (${earn.daysUntil} session${earn.daysUntil === 1 ? "" : "s"} out).`;
    }
  }

  const macro = macroPhrase(bundle);
  if (macro) {
    const mSlot = slots.find((s) => s.id === "macro" || s.id === "rates");
    if (mSlot) {
      mSlot.weight += 6;
      mSlot.desc = macro.replace(/<[^>]+>/g, "").slice(0, 200);
    }
  }

  slots = normalizeWeights(slots);
  return slots.map((s) => [s.title, s.desc, `${s.weight}%`]);
}

/**
 * @param {DeepDiveBundle} bundle
 * @returns {ComposedDeepDiveIntel}
 */
export function composeDeepDiveIntel(bundle) {
  const pct = bundle.quote?.pctChange;
  const isUp = pct != null ? pct >= 0 : false;
  const price =
    bundle.quote?.price != null ? bundle.quote.price.toFixed(2) : "—";
  const chg =
    pct != null && bundle.quote
      ? `${isUp ? "+" : ""}${(bundle.quote.change || 0).toFixed(2)}  (${isUp ? "+" : ""}${pct.toFixed(2)}%)`
      : "—";

  return {
    name: `${bundle.meta.displayName.toUpperCase()} · ${bundle.meta.sectorLabel.toUpperCase()}`,
    summaryHtml: composeOverviewHtml(bundle),
    reasons: composeDrivers(bundle),
    chgColor: isUp ? "#3ddc97" : "#ff5b6e",
    price,
    chg,
    trend: pct != null ? (pct >= 0 ? 0.08 : -0.25) : 0,
    provenance: bundle.provenance,
  };
}

/**
 * @param {DeepDiveProvenance} provenance
 */
export function provenanceBadgeHtml(provenance) {
  const cls =
    provenance === "Live Intelligence"
      ? "tdd-provenance tdd-provenance--live"
      : provenance === "Cached Data"
        ? "tdd-provenance tdd-provenance--cached"
        : "tdd-provenance tdd-provenance--model";
  return `<span class="${cls}" title="How this overview was generated">${esc(provenance)}</span>`;
}
