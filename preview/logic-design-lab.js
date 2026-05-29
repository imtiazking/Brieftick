/**
 * Logic Design Lab — static mock UI only (no Clerk, no API, no redirects).
 * @module preview/logic-design-lab
 */

import { LOGIC_MODES, LOGIC_DISCLAIMER } from "../logic/types.js";
import { renderConversationalLogic, bindConversationalChips } from "./logic-conversational.js";
import { buildConversationalPresentation } from "../logic/engines/conversationalPresentation.js";

const LAB_BUILD = "design-lab-static";
const PRIMARY_MODES = new Set(["market-pulse", "ticker", "risk-regime"]);
const MODE_SHORT = {
  "market-pulse": "Pulse",
  ticker: "Ticker",
  portfolio: "Portfolio",
  watchlist: "Watchlist",
  "sector-rotation": "Sectors",
  "risk-regime": "Risk",
  "daily-brief": "Brief",
  scenario: "Scenario",
  briefing: "Briefing",
  causal: "Causal",
  "macro-interpretation": "Macro",
};

const HERO_PROMPTS = [
  { label: "Why is Nvidia moving?", prompt: "Why is Nvidia moving?" },
  { label: "Analyze my portfolio", prompt: "Analyze my portfolio" },
  { label: "Show risk regime", prompt: "Show risk regime" },
  { label: "Explain today's market", prompt: "Explain today's market" },
];

const PREVIEW_ALERTS = [
  { label: "CPI", when: "Tomorrow", prompt: "How might tomorrow's CPI print affect risk assets?" },
  { label: "NVDA earnings", when: "Next week", prompt: "What should I watch into NVDA earnings?" },
];

const MOCK_BY_MODE = {
  "market-pulse": {
    title: "Logic · Market pulse",
    mode: "market-pulse",
    modeLabel: "Market Pulse",
    cards: {
      snapshot: "S&P 500 firm with megacap tech leading; breadth only partially confirms.",
      catalyst: "Earnings expectations and AI capex narrative driving index tone.",
      macroContext: "Front-end yields contained; dollar steady.",
      sectorImpact: "Tech leadership vs lagging cyclicals and small caps.",
      volatility: "Implied vol drifting lower into macro events.",
      aiSummary: "Selective risk-on with narrow leadership.",
    },
    summary:
      "The tape is holding a selective risk-on tone: megacap tech is carrying index returns while breadth stays mixed and cyclicals lag.",
    directAnswer:
      "Today's session reads risk-on but narrow — leadership is concentrated in AI-linked megacaps while the broader market only partially confirms the move.",
    keyDrivers: [
      "Megacap earnings expectations anchoring index direction",
      "Rates stable with front-end yields contained",
      "Breadth lagging headline index highs",
    ],
    signals: ["Narrow leadership", "Vol compressing", "Dollar steady"],
    confidence: 74,
    confidenceLabel: "Moderate",
    primarySymbol: "SPY",
    mockData: true,
    dataLimited: true,
    sources: ["Design lab mock"],
    disclaimer: LOGIC_DISCLAIMER,
  },
  ticker: {
    title: "Logic · NVDA",
    mode: "ticker",
    modeLabel: "Ticker Intelligence",
    cards: {
      snapshot: "NVDA lower on profit-taking after extended AI-led run.",
      catalyst: "Datacenter demand narrative intact; near-term expectations repriced.",
      macroContext: "Semiconductor beta to rates and growth positioning.",
      sectorImpact: "AI infrastructure peers moving in sympathy.",
      volatility: "Options positioning elevated into catalyst window.",
      aiSummary: "Pullback within intact AI leadership theme.",
    },
    summary:
      "NVDA is trading softer on profit-taking after an extended AI-led run; the narrative remains tied to datacenter demand and supply visibility.",
    directAnswer:
      "NVDA is lower today as growth trades reprice near-term expectations — the AI capex story is intact, but the stock is digesting prior strength.",
    keyDrivers: [
      "Semiconductor beta to rates and growth positioning",
      "Peer sympathy across AI infrastructure names",
      "Options positioning into upcoming catalysts",
    ],
    signals: ["Profit-taking", "High beta", "Earnings window approaching"],
    confidence: 71,
    confidenceLabel: "Moderate",
    primarySymbol: "NVDA",
    mockData: true,
    dataLimited: true,
    sources: ["Design lab mock"],
    disclaimer: LOGIC_DISCLAIMER,
  },
  "risk-regime": {
    title: "Logic · Risk regime",
    mode: "risk-regime",
    modeLabel: "Risk Regime",
    cards: {
      snapshot: "Equities firm while vol markets price event risk.",
      catalyst: "Macro calendar clustering this week.",
      macroContext: "Rates range-bound; credit spreads stable.",
      sectorImpact: "Defensive quality bid vs high-beta growth.",
      volatility: "VIX elevated vs realized but fading intraday.",
      aiSummary: "Transitional mixed-to-cautious regime.",
    },
    summary:
      "Cross-asset signals imply a transitional regime: equities firm but volatility remains bid on macro event risk.",
    directAnswer:
      "Risk regime is mixed-to-cautious — equities hold up, but vol markets are not fully endorsing a clean risk-on shift.",
    keyDrivers: [
      "VIX elevated vs realized but fading intraday",
      "Credit spreads stable",
      "Macro calendar clustering this week",
    ],
    signals: ["Vol bid", "Rates range-bound", "Credit calm"],
    confidence: 68,
    confidenceLabel: "Moderate",
    primarySymbol: "VIX",
    mockData: true,
    dataLimited: true,
    sources: ["Design lab mock"],
    disclaimer: LOGIC_DISCLAIMER,
  },
};

let activeMode = "market-pulse";
let isProcessing = false;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickMock(prompt) {
  const q = (prompt || "").toLowerCase();
  if (/nvidia|nvda|ticker|moving|earnings/.test(q)) return { ...MOCK_BY_MODE.ticker, _logicPrompt: prompt };
  if (/risk|regime|vix|vol/.test(q)) return { ...MOCK_BY_MODE["risk-regime"], _logicPrompt: prompt };
  if (/portfolio|book|holdings/.test(q)) {
    return {
      ...MOCK_BY_MODE["market-pulse"],
      title: "Logic · Portfolio (mock)",
      mode: "portfolio",
      modeLabel: "Portfolio",
      directAnswer:
        "Design lab mock: your book shows moderate tech concentration with a defensive cash buffer — no live portfolio data is loaded on this page.",
      _logicPrompt: prompt,
    };
  }
  const base = MOCK_BY_MODE[activeMode] || MOCK_BY_MODE["market-pulse"];
  return { ...base, _logicPrompt: prompt };
}

function renderUserBubble(text) {
  return `<div class="logic-msg logic-msg--user">
    <div class="logic-msg-head"><span class="logic-msg-role">You</span></div>
    <p class="logic-msg-summary">${escapeHtml(text)}</p>
  </div>`;
}

function renderLogicAnswer(res, prompt) {
  const payload = {
    ...res,
    conversational:
      res.conversational ||
      buildConversationalPresentation(res, {
        prompt,
        responsePlan: { intentId: res.responseIntent },
        primaryEntity: res.primarySymbol ? { symbol: res.primarySymbol } : undefined,
      }),
  };
  return renderConversationalLogic(payload, "logic");
}

function renderResultSurface(html, state = "ready") {
  const surface = document.getElementById("logicResultSurface");
  const idle = document.getElementById("logicResultIdle");
  const content = document.getElementById("logicResultContent");
  if (!surface || !content) return;

  surface.classList.remove("is-ready", "is-processing");
  if (state === "processing") surface.classList.add("is-processing");
  if (state === "ready") surface.classList.add("is-ready");

  if (state === "idle") {
    if (idle) idle.hidden = false;
    content.hidden = true;
    content.innerHTML = "";
    return;
  }

  if (idle) idle.hidden = true;
  content.hidden = false;
  content.innerHTML = html;
  bindConversationalChips(content);
}

function setRunButtonsDisabled(disabled) {
  document.querySelectorAll(".logic-hero-submit, .logic-command-submit").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function submitLogicQuery(prompt) {
  const text = (prompt || "").trim();
  if (!text || isProcessing) return;

  isProcessing = true;
  setRunButtonsDisabled(true);

  const userHtml = renderUserBubble(text);
  renderResultSurface(
    userHtml +
      `<div class="logic-msg logic-msg--loading"><div class="logic-processing"><span>Analyzing…</span></div><div class="logic-skeleton" style="width:72%;margin-top:10px"></div></div>`,
    "processing"
  );

  window.setTimeout(() => {
    const res = pickMock(text);
    renderResultSurface(userHtml + renderLogicAnswer(res, text), "ready");
    isProcessing = false;
    setRunButtonsDisabled(false);
  }, 520);
}

function renderHeroChips() {
  const wrap = document.getElementById("logicHeroChips");
  if (!wrap) return;
  wrap.innerHTML = HERO_PROMPTS.map(
    (p) =>
      `<button type="button" class="logic-hero-chip" data-prompt="${escapeHtml(p.prompt)}">${escapeHtml(p.label)}</button>`
  ).join("");
  wrap.querySelectorAll("[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => submitLogicQuery(btn.dataset.prompt));
  });
}

function renderModeRail() {
  const sidebar = document.getElementById("logicModeSidebar");
  if (!sidebar) return;

  const primary = LOGIC_MODES.filter((m) => PRIMARY_MODES.has(m.id));
  const more = LOGIC_MODES.filter((m) => !PRIMARY_MODES.has(m.id));

  const btn = (m) => {
    const short = MODE_SHORT[m.id] || m.icon;
    return `<button type="button" class="logic-mode-btn${m.id === activeMode ? " active" : ""}" data-mode="${m.id}">
      <span class="logic-mode-icon">${m.icon}</span>
      <span class="logic-mode-label">${escapeHtml(short)}</span>
      <span class="logic-mode-desc">${escapeHtml(m.desc)}</span>
    </button>`;
  };

  sidebar.classList.add("logic-modes-rail");
  sidebar.innerHTML = `
    <div class="logic-modes-rail__label">Logic Modes</div>
    <div class="logic-modes-rail__primary">${primary.map(btn).join("")}</div>
    <details class="logic-modes-rail__more">
      <summary class="logic-modes-rail__more-sum">More</summary>
      <div class="logic-modes-rail__more-list">${more.map(btn).join("")}</div>
    </details>`;

  sidebar.querySelectorAll(".logic-mode-btn").forEach((el) => {
    el.addEventListener("click", () => {
      activeMode = el.dataset.mode || "market-pulse";
      sidebar.querySelectorAll(".logic-mode-btn").forEach((b) => b.classList.toggle("active", b === el));
      const hero = document.getElementById("logicHeroInput");
      const prompts = {
        "market-pulse": "Explain today's market",
        ticker: "Why is Nvidia moving?",
        "risk-regime": "Show risk regime",
        portfolio: "Analyze my portfolio",
        "sector-rotation": "Show me AI sector rotation",
      };
      if (hero) hero.value = prompts[activeMode] || "";
    });
  });
}

function mountContextSidebar() {
  const root = document.getElementById("logicContextSidebar");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";
  root.classList.add("logic-ctx-rail");

  root.innerHTML = `
    <section class="logic-ctx-block logic-ctx-block--watch" aria-label="Watchlist">
      <div class="logic-ctx-label">Watchlist</div>
      <div class="logic-ctx-watch logic-ctx-watch--compact">
        ${["NVDA", "TSLA", "AAPL"]
          .map(
            (sym) => `<div class="logic-ctx-ticker" data-ticker="${sym}">
          <button type="button" class="logic-ctx-ticker-btn">${sym}</button>
          <div class="logic-ctx-ticker-menu" hidden>
            <button type="button" class="logic-ctx-action" data-prompt="Why is ${sym} moving?">Why moving?</button>
            <button type="button" class="logic-ctx-action" data-prompt="What is the key risk for ${sym}?">Risk</button>
          </div>
        </div>`
          )
          .join("")}
        <details class="logic-ctx-watch-more">
          <summary class="logic-ctx-watch-more-sum">+2 saved</summary>
          <div class="logic-ctx-watch-more-list">
            <div class="logic-ctx-ticker"><button type="button" class="logic-ctx-ticker-btn">MSFT</button></div>
            <div class="logic-ctx-ticker"><button type="button" class="logic-ctx-ticker-btn">AMD</button></div>
          </div>
        </details>
      </div>
    </section>
    <details class="logic-ctx-rail__more" open>
      <summary class="logic-ctx-rail__more-sum">Context</summary>
      <section class="logic-ctx-block logic-ctx-block--ambient">
        <div class="logic-ctx-label">Market state</div>
        <p class="logic-ctx-line" id="logicCtxMarket">Risk-on · VIX 14.2 · Narrow leadership</p>
      </section>
      <section class="logic-ctx-block logic-ctx-block--ambient">
        <div class="logic-ctx-label">Alerts</div>
        <ul class="logic-ctx-alerts">
          ${PREVIEW_ALERTS.map(
            (a) => `<li class="logic-ctx-alert">
            <button type="button" class="logic-ctx-alert-btn" data-prompt="${escapeHtml(a.prompt)}">
              <span class="logic-ctx-alert-name">${escapeHtml(a.label)}</span>
              <span class="logic-ctx-alert-when">${escapeHtml(a.when)}</span>
            </button>
          </li>`
          ).join("")}
        </ul>
      </section>
    </details>`;

  root.addEventListener("click", (e) => {
    const promptBtn = e.target.closest("[data-prompt]");
    if (promptBtn && root.contains(promptBtn)) {
      e.preventDefault();
      submitLogicQuery(promptBtn.getAttribute("data-prompt"));
      return;
    }
    const toggle = e.target.closest(".logic-ctx-ticker-btn");
    if (toggle && root.contains(toggle)) {
      const wrap = toggle.closest(".logic-ctx-ticker");
      const menu = wrap?.querySelector(".logic-ctx-ticker-menu");
      if (!wrap || !menu) return;
      const open = wrap.classList.toggle("is-open");
      menu.hidden = !open;
    }
  });
}

function bindForms() {
  document.getElementById("logicHeroForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitLogicQuery(document.getElementById("logicHeroInput")?.value);
    const input = document.getElementById("logicHeroInput");
    if (input) input.value = "";
  });

  document.getElementById("logicSearchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitLogicQuery(document.getElementById("logicSearchInput")?.value);
    closeLogicSearch();
  });

  document.getElementById("logicSearchClose")?.addEventListener("click", closeLogicSearch);
  document.getElementById("logicSearchOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "logicSearchOverlay") closeLogicSearch();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLogicSearch();
    }
    if (e.key === "Escape") closeLogicSearch();
  });
}

function openLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  overlay?.classList.add("open");
  overlay?.setAttribute("aria-hidden", "false");
  document.getElementById("logicSearchInput")?.focus();
}

function closeLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  overlay?.classList.remove("open");
  overlay?.setAttribute("aria-hidden", "true");
}

function initDesignLab() {
  document.documentElement.dataset.theme = "logic";
  document.documentElement.classList.add("logic-design-lab");

  const badge = document.getElementById("logicLabBuild");
  if (badge) badge.textContent = `Static mock · ${LAB_BUILD}`;

  window.submitLogicQuery = submitLogicQuery;
  window.__logicFormGuard = (e) => {
    e?.preventDefault?.();
    return false;
  };

  renderModeRail();
  mountContextSidebar();
  renderHeroChips();
  bindForms();

  const tel = document.getElementById("logicTelemetryRegime");
  if (tel) tel.textContent = "DESIGN LAB · MOCK";

  window.setTimeout(() => document.getElementById("logicHeroInput")?.focus(), 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDesignLab);
} else {
  initDesignLab();
}
