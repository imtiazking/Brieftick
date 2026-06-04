/**
 * Smart Money Flow story config (production Insider page).
 * @module lib/insider-smart-money-themes
 */

export const INSIDER_SMART_MONEY = {
  title: "Where Smart Money Is Moving",
  overallFlowTitle: "Overall Flow",
  defaultOverallBody:
    "Insider selling remains elevated; buying is selective in Energy. Political filings cluster in Defense and semiconductors.",
  flows: [
    {
      id: "insider-buy",
      label: "Insider Buying",
      sector: "Energy",
      tone: "buy",
      itab: "corporate",
      direction: "buy",
      keyNames: ["XOM", "CVX", "COP"],
      why: "Purchases across several energy names.",
      whyItMatters: "See if buying is sector-wide or isolated to a few filers.",
    },
    {
      id: "insider-sell",
      label: "Insider Selling",
      sector: "Technology",
      tone: "sell",
      itab: "corporate",
      direction: "sell",
      keyNames: ["NVDA", "AAPL", "MSFT"],
      why: "Executive sales are elevated in large-cap tech.",
      whyItMatters: "Check if sales align with vesting or earnings before reading each filing.",
    },
    {
      id: "political-buy",
      label: "Political Buying",
      sector: "Defense",
      tone: "buy",
      itab: "politics",
      keyNames: ["LMT", "RTX", "NOC"],
      why: "Fresh lawmaker purchases in defense contractors.",
      whyItMatters:
        "Filings are delayed with wide ranges — use as a research theme, not a timing signal.",
    },
    {
      id: "cluster",
      label: "Cluster Activity",
      sector: "Automotive",
      tone: "mixed",
      itab: "notable",
      keyNames: ["TSLA", "F", "GM"],
      why: "Grouped filings across EV and legacy auto names.",
      whyItMatters: "See if activity is peer-wide or driven by one standout filer.",
    },
  ],
};

/**
 * @param {object[]} corpData
 * @param {object[]} polData
 */
export function buildOverallFlowSummary(corpData, polData) {
  const corp = corpData || [];
  const pol = polData || [];
  if (!corp.length && !pol.length) {
    return INSIDER_SMART_MONEY.defaultOverallBody;
  }

  const isCorpBuy = (r) => {
    const a = (r.action || "").toLowerCase();
    return a.includes("buy") || a.includes("purchase") || a.includes("acqui");
  };

  const buys = corp.filter(isCorpBuy);
  const sells = corp.filter((r) => !isCorpBuy(r));
  const line1 =
    sells.length > buys.length
      ? "Insider selling remains elevated"
      : "Insider buying has picked up";

  const energy = ["XOM", "CVX", "COP"];
  const hasEnergy = buys.some((r) => energy.includes((r.ticker || "").toUpperCase()));
  const line1b = hasEnergy
    ? "; selective buying has appeared in Energy"
    : "; buying stays selective in pockets";

  const def = ["LMT", "RTX", "NOC"];
  const semi = ["NVDA", "AMD"];
  const polSyms = pol.map((t) => (t.ticker || "").replace("$", "").toUpperCase());
  const hasDef = polSyms.some((s) => def.includes(s));
  const hasSemi = polSyms.some((s) => semi.includes(s));

  let line2 = "Political filings remain spread across sectors";
  if (hasDef && hasSemi) line2 = "Political filings cluster in Defense and semiconductors";
  else if (hasDef) line2 = "Political filings cluster in Defense names";
  else if (hasSemi) line2 = "Political filings show semiconductor activity";

  return `${line1}${line1b}. ${line2}.`;
}

/**
 * @param {object} row
 * @param {{ keyNames?: string[], direction?: string, itab?: string }} flow
 */
export function corporateRowMatchesFlow(row, flow) {
  if (!flow || flow.itab !== "corporate") return true;
  const sym = (row.ticker || "").toUpperCase();
  const keys = (flow.keyNames || []).map((s) => s.toUpperCase());
  const isBuy =
    (row.action || "").toLowerCase().includes("buy") ||
    (row.action || "").toLowerCase().includes("purchase") ||
    (row.action || "").toLowerCase().includes("acqui");

  if (keys.includes(sym)) return true;
  if (flow.id === "insider-buy" && isBuy) return keys.includes(sym);
  if (flow.id === "insider-sell" && !isBuy) return keys.includes(sym);
  if (flow.direction === "buy" && isBuy) return keys.includes(sym);
  if (flow.direction === "sell" && !isBuy) return keys.includes(sym);
  return false;
}

/**
 * @param {object} row
 * @param {{ keyNames?: string[], itab?: string }} flow
 */
export function politicsRowMatchesFlow(row, flow) {
  if (!flow || flow.itab !== "politics") return true;
  const sym = (row.ticker || "").replace("$", "").toUpperCase();
  return (flow.keyNames || []).map((s) => s.toUpperCase()).includes(sym);
}

/**
 * @param {string} sym
 * @param {{ keyNames?: string[], itab?: string }} flow
 */
export function clusterSymMatchesFlow(sym, flow) {
  if (!flow || flow.itab !== "notable") return true;
  return (flow.keyNames || []).map((s) => s.toUpperCase()).includes(sym.toUpperCase());
}
