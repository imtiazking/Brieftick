/**
 * Portfolio page — simplified layout presentation (sync after renderPortfolio).
 * @module lib/portfolio-layout
 */

const BUILDER_COLLAPSED_KEY = "brieftick_portfolio_builder_collapsed";
const ADVANCED_OPEN_KEY = "brieftick_portfolio_advanced_open";

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
  if (rows.some((r) => r.level === "high")) return { label: "Elevated", tone: "high" };
  if (scoreLabel === "Elevated") return { label: "Elevated", tone: "high" };
  if (rows.some((r) => r.level === "med") || scoreLabel === "Moderate") {
    return { label: "Moderate", tone: "med" };
  }
  return { label: "Lower", tone: "low" };
}

function topMovers(holdings, quotes) {
  if (!holdings?.length) return [];
  const metaFn =
    typeof window.getPortfolioMeta === "function" ? window.getPortfolioMeta : () => ({ demoMove: 0 });
  return holdings
    .map((h) => {
      const q = quotes?.[h.symbol];
      const move = q && !Number.isNaN(q.pctChange) ? q.pctChange : metaFn(h.symbol).demoMove || 0;
      const impact = Math.abs(move) * (h.weight / 100);
      return { symbol: h.symbol, move, weight: h.weight, impact };
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2);
}

function healthVerdict(scoreLabel, largestSector, topHolding) {
  if (!topHolding?.symbol) return "Add holdings to see your portfolio health summary.";
  const div =
    scoreLabel === "Diversified"
      ? "Your book looks reasonably diversified"
      : scoreLabel === "Moderate"
        ? "Your book has moderate concentration"
        : "Your book looks concentrated";
  const sector =
    largestSector?.[0] && largestSector[1] > 0
      ? `, with ${largestSector[0]} as the largest sector (${formatPct(largestSector[1])})`
      : "";
  const top = topHolding.weight
    ? ` and ${topHolding.symbol} as the largest position (${formatPct(topHolding.weight)}).`
    : ".";
  return div + sector + top;
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

  const scoreText = getText("concentrationScore");
  const scoreLabel = getText("concentrationLabel");
  const dayText = getText("portfolioDayChange");

  setText("portHealthDiversification", scoreText || "—");
  const sub = document.getElementById("portHealthDiversificationLabel");
  if (sub) {
    sub.textContent = scoreLabel ? `${scoreLabel} diversification` : "—";
    sub.style.color =
      document.getElementById("concentrationLabel")?.style.color || "var(--ink-dim)";
  }
  const scoreEl = document.getElementById("portHealthDiversification");
  if (scoreEl && document.getElementById("concentrationScore")) {
    scoreEl.style.color = document.getElementById("concentrationScore").style.color;
  }

  const todayEl = document.getElementById("portHealthToday");
  if (todayEl) {
    todayEl.textContent = dayText || "—";
    const daySrc = document.getElementById("portfolioDayChange");
    if (daySrc) todayEl.style.color = daySrc.style.color || "var(--ink-dim)";
  }

  const risks = parseRiskRowsFromDom();
  const risk = overallRiskLevel(risks, scoreLabel);
  const riskEl = document.getElementById("portHealthRiskLevel");
  if (riskEl) {
    riskEl.textContent = risk.label;
    riskEl.className = `val port-health-risk port-health-risk--${risk.tone}`;
  }

  setText(
    "portHealthLargestExposure",
    largestSector ? `${largestSector[0]} (${formatPct(largestSector[1])})` : "—"
  );
  setText(
    "portHealthTopHolding",
    topHolding ? `${topHolding.symbol} (${formatPct(topHolding.weight)})` : "—"
  );
  setText("portHealthVerdict", healthVerdict(scoreLabel, largestSector, topHolding));

  const insight = getText("portfolioInsight");
  const insightWrap = document.getElementById("portTodayInsight");
  if (insightWrap) {
    insightWrap.innerHTML = insight
      ? `<b>What we're seeing:</b> ${esc(insight)}`
      : `<b>What we're seeing:</b> Add holdings to generate a plain-English summary.`;
  }

  const todayRisks = document.getElementById("portTodayRisks");
  if (todayRisks) {
    const picked = [];
    for (const level of ["high", "med", "low"]) {
      for (const r of risks) {
        if (r.level === level && picked.length < 3) picked.push(r);
      }
    }
    todayRisks.innerHTML = picked.length
      ? picked.map((r) => `<li><strong>${esc(r.title)}</strong> — ${esc(r.det)}</li>`).join("")
      : "<li>No risk factors yet — analyze your portfolio to see highlights here.</li>";
  }

  const moversEl = document.getElementById("portTodayMovers");
  if (moversEl) {
    const movers = topMovers(holdings, quotes);
    moversEl.innerHTML = movers.length
      ? movers
          .map((m) => {
            const sign = m.move >= 0 ? "+" : "";
            return `<li><strong>${esc(m.symbol)}</strong> (${formatPct(m.weight)} weight) — ${sign}${m.move.toFixed(2)}% today</li>`;
          })
          .join("")
      : hasHoldings
        ? "<li>Day moves will appear after quotes load.</li>"
        : "";
  }

  const statusSrc = document.getElementById("portfolioStatus");
  const todayStatus = document.getElementById("portTodayQuoteStatus");
  if (todayStatus && statusSrc) {
    todayStatus.textContent = statusSrc.textContent;
    todayStatus.className = "port-today-status " + (statusSrc.className.replace("portfolio-status", "").trim());
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

  const openFromStorage = sessionStorage.getItem(ADVANCED_OPEN_KEY) === "1";
  if (openFromStorage) {
    panel.hidden = false;
    advancedSection.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  }

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
