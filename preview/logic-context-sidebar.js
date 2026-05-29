/**
 * Logic context sidebar — compact ambient context (watchlist, tape, exposure, alerts).
 * @module preview/logic-context-sidebar
 */

import { getLogicWatchlist, inferWatchlistExposure } from "../logic/watchlistStore.js";
import { loadSavedPortfolio } from "../logic/portfolioParser.js";
import { runMarketPulseLogic } from "../logic/marketPulseLogic.js";
import { runRiskRegimeLogic } from "../logic/riskRegimeLogic.js";

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COMPACT_WATCH_SYMBOLS = ["NVDA", "TSLA", "AAPL"];

const TICKER_ACTIONS = [
  { label: "Why moving?", suffix: "Why is {sym} moving?" },
  { label: "Earnings", suffix: "What are the earnings drivers for {sym}?" },
  { label: "Risk", suffix: "What is the key risk for {sym} from here?" },
  { label: "Positioning", suffix: "How is positioning in {sym}?" },
  { label: "Sector", suffix: "How does {sym} trade vs its sector today?" },
];

/** Preview calendar stubs — replace with live calendar when wired. */
const PREVIEW_ALERTS = [
  { id: "cpi", label: "CPI", when: "Tomorrow", prompt: "How might tomorrow's CPI print affect risk assets?" },
  { id: "nvda", label: "NVDA earnings", when: "Next week", prompt: "What should I watch into NVDA earnings?" },
  { id: "powell", label: "Powell", when: "Wednesday", prompt: "What are markets expecting from Powell this week?" },
];

/**
 * @param {(prompt: string) => void} onPrompt
 */
export function mountLogicContextSidebar(onPrompt) {
  const root = document.getElementById("logicContextSidebar");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  root.classList.add("logic-ctx-rail");
  root.innerHTML = `
    <section class="logic-ctx-block logic-ctx-block--watch" aria-label="Watchlist">
      <div class="logic-ctx-label">Watchlist</div>
      <div class="logic-ctx-watch logic-ctx-watch--compact" id="logicCtxWatchlist"></div>
    </section>
    <details class="logic-ctx-rail__more">
      <summary class="logic-ctx-rail__more-sum">Context</summary>
      <section class="logic-ctx-block logic-ctx-block--ambient" aria-label="Market state">
        <div class="logic-ctx-label">Market state</div>
        <p class="logic-ctx-line" id="logicCtxMarket">Loading tape…</p>
      </section>
      <section class="logic-ctx-block logic-ctx-block--optional logic-ctx-block--ambient" id="logicCtxExposureBlock" hidden>
        <div class="logic-ctx-label">Exposure</div>
        <p class="logic-ctx-line" id="logicCtxExposure"></p>
      </section>
      <section class="logic-ctx-block logic-ctx-block--ambient" aria-label="Alerts">
        <div class="logic-ctx-label">Alerts</div>
        <ul class="logic-ctx-alerts" id="logicCtxAlerts"></ul>
      </section>
      <details class="logic-ctx-manage" id="logicCtxManage">
        <summary class="logic-ctx-manage-sum">Manage book</summary>
        <div id="logicPortfolioMount" class="logic-ctx-manage-body"></div>
      </details>
    </details>
  `;

  renderWatchlistSection(onPrompt);
  renderAlertsSection(onPrompt);
  bindSidebarDelegation(root, onPrompt);
}

/**
 * @param {(prompt: string) => void} onPrompt
 */
function watchlistTickerRow(sym) {
  return `<div class="logic-ctx-ticker" data-ticker="${escapeHtml(sym)}">
      <button type="button" class="logic-ctx-ticker-btn" data-ticker-toggle="${escapeHtml(sym)}">${escapeHtml(sym)}</button>
      <div class="logic-ctx-ticker-menu">
        ${TICKER_ACTIONS.map(
          (a) =>
            `<button type="button" class="logic-ctx-action" data-prompt="${escapeHtml(a.suffix.replace("{sym}", sym))}">${escapeHtml(a.label)}</button>`
        ).join("")}
      </div>
    </div>`;
}

function renderWatchlistSection(onPrompt) {
  const el = document.getElementById("logicCtxWatchlist");
  if (!el) return;
  const saved = getLogicWatchlist();
  const compact = COMPACT_WATCH_SYMBOLS;
  const extra = saved.filter((s) => !compact.includes(s));

  let html = compact.map((sym) => watchlistTickerRow(sym)).join("");
  if (extra.length) {
    html += `<details class="logic-ctx-watch-more">
      <summary class="logic-ctx-watch-more-sum">+${extra.length} saved</summary>
      <div class="logic-ctx-watch-more-list">${extra.map((sym) => watchlistTickerRow(sym)).join("")}</div>
    </details>`;
  } else if (!saved.length) {
    html += '<p class="logic-ctx-empty">Hover a symbol for actions</p>';
  }
  el.innerHTML = html;
}

/**
 * @param {(prompt: string) => void} onPrompt
 */
function renderAlertsSection(onPrompt) {
  const el = document.getElementById("logicCtxAlerts");
  if (!el) return;
  el.innerHTML = PREVIEW_ALERTS.slice(0, 2)
    .map(
      (a) => `<li class="logic-ctx-alert">
      <button type="button" class="logic-ctx-alert-btn" data-prompt="${escapeHtml(a.prompt)}">
        <span class="logic-ctx-alert-name">${escapeHtml(a.label)}</span>
        <span class="logic-ctx-alert-when">${escapeHtml(a.when)}</span>
      </button>
    </li>`
    )
    .join("");
}

/**
 * @param {HTMLElement} root
 * @param {(prompt: string) => void} onPrompt
 */
function bindSidebarDelegation(root, onPrompt) {
  root.addEventListener("click", (e) => {
    const promptBtn = e.target.closest("[data-prompt]");
    if (promptBtn && root.contains(promptBtn)) {
      e.preventDefault();
      const q = promptBtn.getAttribute("data-prompt");
      if (q) onPrompt(q);
      return;
    }

    const toggle = e.target.closest("[data-ticker-toggle]");
    if (toggle && root.contains(toggle)) {
      e.preventDefault();
      const wrap = toggle.closest(".logic-ctx-ticker");
      if (!wrap) return;
      const menu = wrap.querySelector(".logic-ctx-ticker-menu");
      const open = wrap.classList.toggle("is-open");
      if (menu) menu.hidden = !open;
      root.querySelectorAll(".logic-ctx-ticker.is-open").forEach((t) => {
        if (t !== wrap) {
          t.classList.remove("is-open");
          const m = t.querySelector(".logic-ctx-ticker-menu");
          if (m) m.hidden = true;
        }
      });
    }
  });
}

/**
 * @param {(prompt: string) => void} onPrompt
 */
export function refreshLogicContextSidebar(onPrompt) {
  renderWatchlistSection(onPrompt);
  refreshExposureLine();
}

function refreshExposureLine() {
  const block = document.getElementById("logicCtxExposureBlock");
  const line = document.getElementById("logicCtxExposure");
  if (!block || !line) return;

  const watch = getLogicWatchlist();
  const saved = loadSavedPortfolio();
  const hasBook = saved?.holdings?.length > 0;
  const hasWatch = watch.length > 0;

  if (!hasBook && !hasWatch) {
    block.hidden = true;
    return;
  }

  block.hidden = false;
  const exp = inferWatchlistExposure(watch);
  const pf = saved?.profile;
  const themes = exp.themes?.slice(0, 2).join(" · ") || "Mixed";
  const aiTilt = exp.aiExposureScore >= 50 ? "AI tilt" : exp.aiExposureScore >= 25 ? "Moderate AI" : "Balanced";
  const rates =
    exp.ratesSensitivity === "elevated" ? "Rates-sensitive" : "Rates-neutral";
  const conc = pf?.concentrationLabel || (hasBook ? "Book on file" : "Watchlist only");
  line.textContent = [aiTilt, rates, conc !== "Book on file" ? conc : themes]
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

/**
 * Compact one-line market state for sidebar.
 */
export async function hydrateLogicMarketState() {
  const el = document.getElementById("logicCtxMarket");
  if (!el) return;
  try {
    const [pulse, risk] = await Promise.all([
      runMarketPulseLogic({ prompt: "market pulse" }),
      runRiskRegimeLogic({ prompt: "risk regime" }),
    ]);
    const regime = risk.signals?.[0] || "Mixed";
    const vix =
      risk.optionalCards?.riskSignal?.match(/VIX[^·]*/i)?.[0] ||
      document.getElementById("vixValue")?.textContent?.trim() ||
      risk.cards?.volatility?.match(/[\d.]+/)?.[0];
    const vixPart = vix ? (String(vix).includes("VIX") ? vix : `VIX ${vix}`) : "VIX monitored";
    const leadership =
      pulse.signals?.find((s) => /narrow|breadth|leadership|mega/i.test(s)) ||
      pulse.signals?.[1] ||
      "Narrow leadership";
    el.textContent = `${regime} · ${vixPart} · ${leadership}`.replace(/\s+/g, " ").slice(0, 120);
  } catch (_) {
    el.textContent = "Risk-on · VIX monitored · Tape mixed";
  }
}
