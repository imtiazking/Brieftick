/**
 * Portfolio page — beginner-first layout (sync after renderPortfolio).
 * @module lib/portfolio-layout
 */

const BUILDER_COLLAPSED_KEY = "brieftick_portfolio_builder_collapsed";
const ADVANCED_OPEN_KEY = "brieftick_portfolio_advanced_open";

const COMPANY_ALIASES = {
  GOOGL: "Google",
  GOOG: "Google",
  AMZN: "Amazon",
  META: "Meta",
  NVDA: "NVIDIA",
  BAC: "Bank of America",
  JPM: "JPMorgan",
  AVGO: "Broadcom",
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPct(v, signed = false) {
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(1)}%`;
}

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent.trim() : "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * @param {string} symbol
 */
function getMeta(symbol) {
  if (typeof window.getPortfolioMeta === "function") {
    return window.getPortfolioMeta(symbol);
  }
  return { name: symbol, sector: "Other", theme: "" };
}

/**
 * @param {string} symbol
 */
function companyLabel(symbol) {
  const sym = String(symbol || "").toUpperCase();
  if (COMPANY_ALIASES[sym]) return COMPANY_ALIASES[sym];
  const name = getMeta(sym).name || sym;
  return name
    .replace(/\s+(Corporation|Inc\.?|Platforms|Co\.?)$/i, "")
    .trim();
}

/**
 * @param {{ symbol: string }[]} items
 */
function nameList(items) {
  const names = items.map((i) => companyLabel(i.symbol));
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function parseRiskRowsFromDom() {
  const list = document.getElementById("portfolioRiskList");
  if (!list) return [];
  return [...list.querySelectorAll(".risk-row")].map((row) => {
    const title = row.querySelector(".risk-name")?.childNodes[0]?.textContent?.trim() || "";
    const det = row.querySelector(".risk-name .det")?.textContent?.trim() || "";
    const levelEl = row.querySelector(".risk-level");
    const level = levelEl?.classList.contains("high")
      ? "high"
      : levelEl?.classList.contains("med")
        ? "med"
        : "low";
    return { title, det, level };
  });
}

function overallRiskLevel(rows, scoreLabel) {
  if (rows.some((r) => r.level === "high")) return { label: "Higher", tone: "high" };
  if (scoreLabel === "Elevated") return { label: "Higher", tone: "high" };
  if (rows.some((r) => r.level === "med") || scoreLabel === "Moderate") {
    return { label: "Moderate", tone: "med" };
  }
  return { label: "Lower", tone: "low" };
}

/**
 * @param {string} sectorName
 */
function plainSectorName(sectorName) {
  const map = {
    "Information Technology": "Technology",
    "Communication Services": "Communication",
    "Consumer Discretionary": "Consumer",
    Financials: "Financials",
    Healthcare: "Healthcare",
    "Broad Market": "Broad market",
    Energy: "Energy",
  };
  return map[sectorName] || sectorName;
}

function plainSectorNameLower(sectorName) {
  return plainSectorName(sectorName).toLowerCase();
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
function holdingContributions(holdings, quotes) {
  if (!holdings?.length) return [];
  return holdings
    .map((h) => {
      const q = quotes?.[h.symbol];
      if (!q || Number.isNaN(q.pctChange)) return null;
      return {
        symbol: h.symbol,
        move: q.pctChange,
        weight: h.weight,
        contribution: (q.pctChange * h.weight) / 100,
      };
    })
    .filter(Boolean);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
function portfolioDayMove(holdings, quotes) {
  const rows = holdingContributions(holdings, quotes);
  if (!rows.length) return null;
  return rows.reduce((sum, r) => sum + r.contribution, 0);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
function topContributors(holdings, quotes, direction) {
  const rows = holdingContributions(holdings, quotes);
  if (direction === "up") {
    return rows
      .filter((r) => r.contribution > 0.02)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2);
  }
  return rows
    .filter((r) => r.contribution < -0.02)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 2);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 */
function techThemeWeight(holdings) {
  return holdings
    .filter((h) => {
      const m = getMeta(h.symbol);
      return /AI|technology|software|Digital ads/i.test(`${m.theme} ${m.sector}`);
    })
    .reduce((sum, h) => sum + h.weight, 0);
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 * @param {[string, number][]} sectors
 */
function buildHelpingNarrative(holdings, quotes, sectors) {
  const helpers = topContributors(holdings, quotes, "up");
  if (!helpers.length) {
    const live = holdingContributions(holdings, quotes).length;
    if (!holdings.length) return "Add holdings first.";
    if (!live) return "Some prices are unavailable right now — we do not show placeholder day moves.";
    return "No holdings are meaningfully positive today — moves are flat or mixed.";
  }
  const names = nameList(helpers);
  const verb = helpers.length > 1 ? "are" : "is";
  const hurters = topContributors(holdings, quotes, "down");
  let text = `${names} ${verb} contributing most to today's gains. Their strong performance is helping your portfolio today.`;
  if (hurters.length) {
    text = `${names} ${verb} contributing most to today's gains. Their strong performance is helping offset weakness elsewhere in the portfolio.`;
  }
  return text;
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
function buildHurtingNarrative(holdings, quotes) {
  const hurters = topContributors(holdings, quotes, "down");
  if (!hurters.length) {
    const live = holdingContributions(holdings, quotes).length;
    if (!holdings.length) return "Add holdings first.";
    if (!live) return "Waiting on live quotes to identify today's drags.";
    return "No holdings are meaningfully negative today.";
  }
  const names = nameList(hurters);
  const verb = hurters.length > 1 ? "are" : "is";
  return `${names} ${verb} the largest drag${hurters.length > 1 ? "s" : ""} on performance today.`;
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 * @param {[string, number][]} sectors
 */
function buildPortfolioStory(holdings, quotes, sectors) {
  if (!holdings.length) {
    return "Add holdings and load live quotes to see a plain-English read on your portfolio.";
  }

  const largestSector = sectors[0] || ["Other", 0];
  const techWeight = techThemeWeight(holdings);
  const dayMove = portfolioDayMove(holdings, quotes);
  const helpers = topContributors(holdings, quotes, "up");
  const hurters = topContributors(holdings, quotes, "down");
  const beta = parseFloat(getText("portStatBeta")) || 1;
  const parts = [];

  if (techWeight >= 35) {
    parts.push(
      `Your portfolio is heavily focused on AI and technology — about ${formatPct(techWeight)} sits in those themes.`
    );
  } else if (largestSector[1] >= 20) {
    parts.push(
      `Your portfolio is most exposed to ${plainSectorNameLower(largestSector[0])}, which makes up ${formatPct(largestSector[1])} of the book.`
    );
  } else {
    parts.push("Your portfolio is spread across several sectors without one dominant theme.");
  }

  if (helpers.length && dayMove != null) {
    const gainWord = dayMove >= 0 ? "gains" : "relative strength";
    const hVerb = helpers.length > 1 ? "are" : "is";
    let gainLine = `Strong moves in ${nameList(helpers)} ${hVerb} supporting today's ${gainWord}.`;
    if (hurters.length && dayMove > 0) {
      gainLine = `Strong gains in ${nameList(helpers)} ${hVerb} helping performance today, while weakness in ${nameList(hurters)} is offsetting some of those gains.`;
    } else if (hurters.length) {
      gainLine = `${nameList(helpers)} ${hVerb} holding up better today, but ${nameList(hurters)} is still weighing on results.`;
    }
    parts.push(gainLine);
  } else if (hurters.length) {
    parts.push(
      `Weakness in ${nameList(hurters)} is the main story today${dayMove != null ? `, with the portfolio ${dayMove >= 0 ? "still slightly positive" : "under pressure"} overall` : ""}.`
    );
  } else if (dayMove == null) {
    parts.push("Today's narrative will sharpen once live quotes finish loading.");
  } else {
    parts.push("Moves are relatively balanced across your holdings today.");
  }

  if (techWeight >= 28 || beta > 1.2 || largestSector[1] >= 30) {
    const focus =
      techWeight >= 28
        ? "concentration in technology"
        : `concentration in ${plainSectorName(largestSector[0])}`;
    const betaNote =
      beta > 1.15
        ? ", which means your portfolio may move more sharply than the broader market"
        : "";
    parts.push(`Your biggest risk remains ${focus}${betaNote}.`);
  } else {
    parts.push("Risk looks more balanced, though your largest positions still deserve attention.");
  }

  return parts.join(" ");
}

/**
 * @param {{ symbol: string, weight: number }[]} holdings
 * @param {Record<string, object> | null | undefined} quotes
 */
export function syncPortfolioLayout(holdings, quotes) {
  const hasHoldings = holdings?.length > 0;
  const groupFn = typeof window.groupBySector === "function" ? window.groupBySector : null;
  const sectors = groupFn && hasHoldings ? groupFn(holdings) : [];
  const largestSector = sectors[0] || null;
  const topHolding = hasHoldings
    ? [...holdings].sort((a, b) => b.weight - a.weight)[0]
    : null;

  const scoreLabel = getText("concentrationLabel");
  const risks = parseRiskRowsFromDom();
  const risk = overallRiskLevel(risks, scoreLabel);

  const liveCount = quotes
    ? holdings.filter((h) => quotes[h.symbol] && !Number.isNaN(quotes[h.symbol].pctChange)).length
    : 0;

  setText(
    "portSummaryTopHolding",
    topHolding ? `${topHolding.symbol} (${formatPct(topHolding.weight)})` : "—"
  );
  setText(
    "portSummaryTopSector",
    largestSector ? `${plainSectorName(largestSector[0])} (${formatPct(largestSector[1])})` : "—"
  );
  const riskEl = document.getElementById("portSummaryRisk");
  if (riskEl) {
    riskEl.textContent = hasHoldings ? risk.label : "—";
    riskEl.className = `val port-summary-risk port-summary-risk--${risk.tone}`;
  }

  const storyEl = document.getElementById("portCardStory");
  if (storyEl) {
    storyEl.textContent = buildPortfolioStory(holdings, quotes, sectors);
  }

  const ownEl = document.getElementById("portCardOwn");
  if (ownEl) {
    if (!hasHoldings) {
      ownEl.textContent = "Add holdings to see where your money is concentrated.";
    } else if (topHolding && largestSector) {
      ownEl.textContent = `Your largest position is ${companyLabel(topHolding.symbol)} (${formatPct(topHolding.weight)} of the portfolio). Your biggest sector is ${plainSectorName(largestSector[0])} at ${formatPct(largestSector[1])}.`;
    } else {
      ownEl.textContent = "—";
    }
  }

  const helpingEl = document.getElementById("portCardHelping");
  if (helpingEl) {
    helpingEl.textContent = buildHelpingNarrative(holdings, quotes, sectors);
  }

  const hurtingEl = document.getElementById("portCardHurting");
  if (hurtingEl) {
    hurtingEl.textContent = buildHurtingNarrative(holdings, quotes);
  }

  const riskCard = document.getElementById("portCardRisk");
  if (riskCard) {
    const picked = [];
    for (const level of ["high", "med", "low"]) {
      for (const r of risks) {
        if (r.level === level && picked.length < 2) picked.push(r);
      }
    }
    if (!hasHoldings) {
      riskCard.textContent = "Analyze your portfolio to see where risk is concentrated.";
    } else if (!picked.length) {
      riskCard.textContent = "No major risk flags from the current layout.";
    } else {
      riskCard.textContent = picked.map((r) => `${r.title}: ${r.det}`).join(" ");
    }
  }

  const watchEl = document.getElementById("portCardWatch");
  if (watchEl) {
    const insight = getText("portfolioInsight");
    if (!hasHoldings) {
      watchEl.textContent = "We will list the main things to keep an eye on after you add holdings.";
    } else if (insight) {
      watchEl.textContent = insight;
    } else {
      watchEl.textContent = "Watch sector concentration and your largest positions into the next sessions.";
    }
  }

  mirrorAdvancedFields();
  updateBuilderCollapsedState(hasHoldings);
}

function mirrorAdvancedFields() {
  const pairs = [
    ["portfolioDayChange", "portfolioDayChangeVisible"],
    ["concentrationScore", "concentrationScoreVisible"],
    ["concentrationLabel", "concentrationLabelVisible"],
    ["portfolioInsight", "portfolioInsightVisible"],
  ];
  for (const [srcId, dstId] of pairs) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (!src || !dst) continue;
    dst.textContent = src.textContent;
    if (src.style.color) dst.style.color = src.style.color;
  }
}

function updateBuilderCollapsedState(hasHoldings) {
  const builder = document.getElementById("portfolioBuilder");
  if (!builder) return;
  if (!hasHoldings) {
    builder.classList.remove("is-collapsed");
    sessionStorage.setItem(BUILDER_COLLAPSED_KEY, "0");
    return;
  }
  const keepOpen = sessionStorage.getItem(BUILDER_COLLAPSED_KEY) === "0";
  builder.classList.toggle("is-collapsed", !keepOpen);
  if (!keepOpen) sessionStorage.setItem(BUILDER_COLLAPSED_KEY, "1");
}

function openPortfolioBuilder() {
  const builder = document.getElementById("portfolioBuilder");
  if (!builder) return;
  builder.classList.remove("is-collapsed");
  sessionStorage.setItem(BUILDER_COLLAPSED_KEY, "0");
  document.getElementById("portfolioInput")?.focus();
}

function bindPortfolioLayout() {
  const builder = document.getElementById("portfolioBuilder");
  document.getElementById("portEditHoldingsBtn")?.addEventListener("click", openPortfolioBuilder);
  document.getElementById("portEditHoldingsBtnInline")?.addEventListener("click", openPortfolioBuilder);

  const advancedSection = document.querySelector(".port-section--advanced");
  const toggle = document.getElementById("portAdvancedToggle");
  const panel = document.getElementById("portAdvancedPanel");
  if (!toggle || !panel || !advancedSection) return;

  panel.hidden = true;
  advancedSection.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    advancedSection.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    sessionStorage.setItem(ADVANCED_OPEN_KEY, open ? "1" : "0");
    if (open && typeof window.renderPortfolioCluster === "function" && window._portClusterHoldings?.length) {
      requestAnimationFrame(() =>
        window.renderPortfolioCluster(window._portClusterHoldings, window._portClusterMatrix)
      );
    }
  });
}

if (typeof window !== "undefined") {
  window.__portfolioLayoutSync = syncPortfolioLayout;
}

bindPortfolioLayout();
