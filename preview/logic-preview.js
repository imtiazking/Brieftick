/**
 * Brieftick Logic — preview UI (Logic Terminal).
 */
import { LOGIC_MODES, buildLogicResponse, LOGIC_DISCLAIMER, LIMITED_DATA_MSG } from "../logic/types.js";
import { detectIntent, routeLogicPrompt } from "../logic/logicRouter.js";
import { resolvePrimaryEntity } from "../logic/entityResolver.js";
import {
  checkLogicAccess,
  getUsageBannerText,
  isLogicTerminalUser,
  LOGIC_UPGRADE_MSG,
  PREMIUM_LOGIC_MODES,
  recordLogicUsage,
} from "../logic/freeAccess.js";
import { resolveCardSchema } from "../logic/cardSchemas.js";
import { mountLogicPortfolioPanel } from "./logic-portfolio-panel.js";
import {
  mountLogicContextSidebar,
  refreshLogicContextSidebar,
  hydrateLogicMarketState,
} from "./logic-context-sidebar.js";
import {
  renderConversationalLogic,
  bindConversationalChips,
} from "./logic-conversational.js";
import { buildConversationalPresentation } from "../logic/engines/conversationalPresentation.js";

const PREVIEW_KEYS = new Set(["logic", "agent"]);
const LOGIC_API_TIMEOUT_MS = 14000;

const HERO_PROMPTS = [
  { label: "Why is Nvidia moving?", prompt: "Why is Nvidia moving?" },
  { label: "Analyze my portfolio", prompt: "Analyze my portfolio" },
  { label: "Show risk regime", prompt: "Show risk regime" },
  { label: "Explain today's market", prompt: "Explain today's market" },
  { label: "AI sector rotation", prompt: "Show me AI sector rotation" },
  { label: "What if oil spikes?", prompt: "What happens if oil prices spike?" },
];

let activeMode = "market-pulse";
let isProcessing = false;
let logicPageInitialized = false;

function logicLog(event, data) {
  const payload = data !== undefined ? data : "";
  console.log(`[Brieftick Logic] ${event}`, payload);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CARD_SECTIONS = [
  ["snapshot", "Snapshot"],
  ["catalyst", "Catalyst"],
  ["macroContext", "Macro Context"],
  ["sectorImpact", "Sector Impact"],
  ["volatility", "Volatility"],
  ["aiSummary", "Summary"],
];

const SCENARIO_CARD_SECTIONS = [
  ["snapshot", "Scenario Snapshot"],
  ["catalyst", "Market Impact"],
  ["sectorImpact", "Sector Winners"],
  ["volatility", "Volatility Outlook"],
  ["aiSummary", "Logic Summary"],
];

const OPTIONAL_SECTIONS = [
  ["riskSignal", "Risk Signal"],
  ["relatedMovers", "Related Movers"],
  ["portfolioImpact", "Portfolio Impact"],
  ["sectorRisks", "Sector Risks"],
];

function ensureFullCards(res) {
  const cards = { ...(res.cards || {}) };
  const summary = res.summary || "Market intelligence context is available.";
  const drivers = res.keyDrivers || [];
  const signals = res.signals || [];
  return {
    ...res,
    cards: {
      snapshot: cards.snapshot || summary.slice(0, 220),
      catalyst: cards.catalyst || drivers[0] || "Headline and catalyst channel in focus",
      macroContext: cards.macroContext || drivers[1] || "Rates, policy, and inflation path anchor the tape",
      sectorImpact: cards.sectorImpact || drivers[2] || "Sector beta and peer sympathy shape relative moves",
      volatility: cards.volatility || signals.find((s) => /vol|risk/i.test(s)) || signals[0] || "Volatility monitored",
      aiSummary: cards.aiSummary || summary,
    },
    disclaimer: res.disclaimer || LOGIC_DISCLAIMER,
  };
}

function renderLoadingState() {
  return `<div class="logic-msg logic-msg--loading" id="logicLoading">
    <div class="logic-processing">
      <span class="logic-processing-glow"></span>
      <span>Analyzing…</span>
    </div>
    <div class="logic-loading-skeleton logic-loading-skeleton--conv">
      <div class="logic-skeleton"></div>
    </div>
  </div>`;
}

/** Preview: conversational answer + on-demand chips (no report grid). */
function useConversationalPreview() {
  return window.__LOGIC_PREVIEW === true;
}

/**
 * @param {import('../logic/types.js').LogicResponse} res
 * @param {string} [role]
 * @param {string} [prompt]
 */
function renderLogicResponse(res, role = "logic", prompt = "") {
  if (!useConversationalPreview()) {
    return renderIntelligenceCard(res, role);
  }
  const payload = {
    ...res,
    _logicPrompt: prompt,
    conversational:
      res.conversational ||
      buildConversationalPresentation(res, {
        prompt,
        responsePlan: { intentId: res.responseIntent },
        primaryEntity: res.primarySymbol ? { symbol: res.primarySymbol } : undefined,
      }),
  };
  return renderConversationalLogic(payload, role);
}

function renderIntelligenceCard(res, role = "logic") {
  const full = ensureFullCards(res);
  const cards = full.cards;
  const optional = full.optionalCards || {};
  const renderSection = (key, label, extraClass = "") => {
    const text = cards[key] || optional[key];
    if (!text) return "";
    const fullRow =
      key === "aiSummary" ? " logic-intel-section--full" : "";
    return `<div class="logic-intel-section${fullRow}${extraClass}">
      <div class="logic-intel-label">${escapeHtml(label)}</div>
      <p class="logic-intel-text">${escapeHtml(text)}</p>
    </div>`;
  };

  const schema = resolveCardSchema(full);
  const schemaKeys = new Set(schema.map((s) => s.key));
  const sections = schema
    .map(({ key, label, optional, fullWidth }) => {
      let extraClass = optional ? " logic-intel-section--optional" : "";
      if (fullWidth) extraClass += " logic-intel-section--full";
      return renderSection(key, label, extraClass);
    })
    .filter(Boolean)
    .join("");

  const optionalOrder = [
    ["sectorRisks", "Sector Losers"],
    ["portfolioImpact", "Supply Chain"],
    ["prioritySignal", "Market Priority"],
    ["marketStructure", "Market Structure"],
    ["crossAssetSignal", "Cross-Asset Signal"],
    ["riskSignal", "Positioning"],
    ["marketDivergence", "Divergence"],
    ["stressSignal", "Stress Signal"],
    ["relatedMovers", "Headline Context"],
    ["narrativeLink", "Narrative Shift"],
  ];
  const optionalHtml = optionalOrder
    .filter(([key]) => optional[key] && !schemaKeys.has(key))
    .map(
      ([key, label]) =>
        `<div class="logic-intel-section logic-intel-section--optional">
      <div class="logic-intel-label">${escapeHtml(label)}</div>
      <p class="logic-intel-text">${escapeHtml(optional[key])}</p>
    </div>`
    )
    .join("");

  const signals = (full.signals || [])
    .map((s) => `<span class="logic-signal-chip">${escapeHtml(s)}</span>`)
    .join("");

  const meta = [
    full.usedAI ? "Logic enriched" : null,
    full.regimeLabel ? `Regime: ${full.regimeLabel}` : null,
    full.dataLimited || full.mockData ? "Partial / delayed data" : null,
    full.confidenceLabel || `Confidence ${full.confidence}%`,
    full.primarySymbol ? full.primarySymbol : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const confidenceDetail =
    full.confidenceReasons?.length
      ? `<p class="logic-confidence-reasons">${escapeHtml(full.confidenceReasons.join(" · "))}</p>`
      : "";

  const limitedBanner =
    full.dataLimited || full.mockData
      ? `<p class="logic-limited-banner">${escapeHtml(LIMITED_DATA_MSG)}</p>`
      : "";

  const directAnswer = full.directAnswer || (full.mode === "briefing" ? full.cards?.snapshot : "");
  const answerBlock = directAnswer
    ? `<div class="logic-direct-answer">
      <div class="logic-intel-label">Answer</div>
      <p class="logic-intel-text logic-direct-answer-text">${escapeHtml(directAnswer)}</p>
    </div>`
    : "";

  return `<div class="logic-msg logic-msg--logic">
    <div class="logic-msg-head">
      <span class="logic-msg-role">${role === "user" ? "You" : "Brieftick Logic"}</span>
      ${full.mode ? `<span class="logic-msg-mode">${escapeHtml(full.modeLabel || full.mode)}</span>` : ""}
    </div>
    <h3 class="logic-msg-title">${escapeHtml(full.title)}</h3>
    ${limitedBanner}
    ${answerBlock}
    <div class="logic-intel-card">${sections}${optionalHtml}</div>
    ${signals ? `<div class="logic-signal-row">${signals}</div>` : ""}
    <div class="logic-msg-foot">
      <span>${escapeHtml(meta)}</span>
      ${confidenceDetail}
      <span class="logic-msg-sources">${escapeHtml((full.sources || []).join(" · "))}</span>
    </div>
    <p class="logic-disclaimer">${escapeHtml(full.disclaimer)}</p>
  </div>`;
}

function renderUserBubble(text) {
  return `<div class="logic-msg logic-msg--user">
    <div class="logic-msg-head"><span class="logic-msg-role">You</span></div>
    <p class="logic-msg-summary">${escapeHtml(text)}</p>
  </div>`;
}

function setRunButtonsDisabled(disabled) {
  document.querySelectorAll(".logic-hero-submit, .logic-command-submit").forEach((btn) => {
    btn.disabled = disabled;
  });
}

/** Render active Logic output only inside #logicResultSurface / #logicResultContent */
function renderResultSurface(html, state = "ready") {
  const surface = document.getElementById("logicResultSurface");
  const idle = document.getElementById("logicResultIdle");
  const content = document.getElementById("logicResultContent");
  if (!content) return;

  if (idle) {
    idle.hidden = true;
    idle.style.display = "none";
  }
  content.hidden = false;
  content.style.display = "flex";
  content.innerHTML = html || "";
  content.scrollTop = 0;
  if (useConversationalPreview()) {
    bindConversationalChips(content);
  }

  if (surface) {
    surface.classList.toggle("is-processing", state === "loading");
    surface.classList.toggle("is-ready", state === "ready");
  }
  logicLog("render state updated", state);
}

function showResultPanelLoading() {
  renderResultSurface(renderLoadingState(), "loading");
}

function scrollResultPanel() {
  const content = document.getElementById("logicResultContent");
  if (content) content.scrollTop = 0;
}

function updateUsageBanner() {
  const el = document.getElementById("logicUsageBanner");
  if (!el) return;
  el.textContent = getUsageBannerText();
  el.hidden = false;
}

function renderAccessBlockedResponse(prompt, reason) {
  const isLimit = reason === "daily_limit";
  const summary = isLimit
    ? `You have used all 5 Free Logic prompts for today. ${LOGIC_UPGRADE_MSG}`
    : LOGIC_UPGRADE_MSG;
  return buildLogicResponse({
    title: isLimit ? "Free Logic limit reached" : "Terminal feature",
    summary,
    cards: {
      snapshot: isLimit ? "Daily Free Logic quota exhausted" : "Portfolio, scenario, and sector Logic require Terminal",
      catalyst: "Upgrade for portfolio intelligence and scenario analysis",
      macroContext: "Terminal unlocks full source depth and live premium data",
      sectorImpact: "Free users can still use Market Pulse, Ticker, Risk Regime, and Daily Brief",
      volatility: "Limits reset at midnight UTC",
      aiSummary: summary,
    },
    keyDrivers: ["Free tier limit", "Terminal unlocks full Logic"],
    signals: [isLimit ? "5/5 used" : "Upgrade required"],
    confidence: 100,
    sources: ["Brieftick Logic · access"],
    disclaimer: LOGIC_DISCLAIMER,
    mode: activeMode,
    mockData: true,
  });
}

function enrichResponseMeta(res, prompt) {
  const primary = resolvePrimaryEntity(prompt);
  const modeMeta = LOGIC_MODES.find((m) => m.id === res.mode);
  const meta = {
    ...res,
    primarySymbol: primary.symbol || undefined,
    modeLabel: modeMeta?.label || res.mode,
    _logicPrompt: prompt,
  };
  if (useConversationalPreview()) return meta;
  return ensureFullCards(meta);
}

function buildMockResponse(prompt, mode) {
  const primary = resolvePrimaryEntity(prompt);
  const sym = primary.symbol || "NVDA";
  const name = primary.companyName || sym;
  return buildLogicResponse({
    title: `${name} (${sym}) · Logic preview`,
    summary: `${name} is in focus on today's tape. Headline sensitivity and sector beta remain the primary channels, with macro rates framing the move. This is a contextual read while live feeds connect.`,
    cards: {
      snapshot: `${sym} — session attention elevated; narrative-driven`,
      catalyst: "Earnings expectations, AI demand commentary, and supply headlines",
      macroContext: "Rate path and risk appetite set the backdrop for mega-cap tech",
      sectorImpact: "Semiconductor and AI peer group sympathy likely amplifies moves",
      volatility: "Single-name volatility active; monitor headline gaps",
      aiSummary: `${name} moves are being read through headlines, sector tone, and macro risk channels rather than an isolated technical print.`,
    },
    keyDrivers: ["Headline flow", "Sector sympathy", "Macro rates"],
    signals: ["Headline-sensitive", "Volatility active"],
    confidence: 58,
    sources: ["Brieftick Logic · preview mock"],
    disclaimer: LOGIC_DISCLAIMER,
    mode: mode || "ticker",
    mockData: true,
    dataLimited: true,
  });
}

function runLogicWithTimeout(prompt, modeHint) {
  logicLog("API request started", { prompt: prompt.slice(0, 80), modeHint });
  return Promise.race([
    routeLogicPrompt(prompt, modeHint),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Logic request timed out")), LOGIC_API_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Single submit entry — hero Run Logic, bottom bar, Enter, chips, Cmd+K.
 */
export async function submitLogicQuery(promptText) {
  const prompt = (promptText || "").trim();
  if (!prompt) {
    logicLog("error", "empty prompt");
    return;
  }
  if (isProcessing) {
    logicLog("error", "already processing");
    return;
  }

  logicLog("submitted prompt", prompt);
  isProcessing = true;
  setRunButtonsDisabled(true);

  const primary = resolvePrimaryEntity(prompt);
  const intent = detectIntent(prompt, primary);
  const mode = intent.mode || "market-pulse";
  activeMode = mode;
  logicLog("entity resolved", primary);
  logicLog("intent detected", intent.intent);
  logicLog("selected Logic module", mode);

  document
    .querySelectorAll(".logic-mode-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

  const userHtml = renderUserBubble(prompt);
  showResultPanelLoading();

  const access = checkLogicAccess(mode);
  if (!access.ok) {
    logicLog("error", { access: access.reason });
    document.getElementById("logicLoading")?.remove();
    const blocked = enrichResponseMeta(
      renderAccessBlockedResponse(prompt, access.reason),
      prompt
    );
    renderResultSurface(userHtml + renderLogicResponse(blocked, "logic", prompt), "ready");
    isProcessing = false;
    setRunButtonsDisabled(false);
    updateUsageBanner();
    logicLog("render state updated", "access blocked");
    return;
  }

  let response;
  try {
    response = enrichResponseMeta(await runLogicWithTimeout(prompt, mode), prompt);
    logicLog("API response received", {
      title: response.title,
      mode: response.mode,
      confidence: response.confidenceLabel || response.confidence,
    });
    logicLog("confidence level", response.confidenceLabel || response.confidence);
  } catch (e) {
    logicLog("error", e.message || e);
    response = enrichResponseMeta(
      {
        ...buildMockResponse(prompt, intent.mode),
        title: "Logic · Fallback intelligence",
        dataLimited: true,
      },
      prompt
    );
    logicLog("fallback triggered", e.message || e);
    logicLog("API response received", "fallback mock");
  }

  document.getElementById("logicLoading")?.remove();
  const cardHtml = renderLogicResponse(response, "logic", prompt);
  renderResultSurface(userHtml + cardHtml, "ready");

  if (!isLogicTerminalUser()) recordLogicUsage();
  updateUsageBanner();
  updateHubFromResponse();
  scrollResultPanel();

  isProcessing = false;
  setRunButtonsDisabled(false);
  logicLog("render state updated", "complete");
}

/** @deprecated alias */
export const handleSubmit = submitLogicQuery;

function updateHubFromResponse() {
  refreshLogicContextSidebar(submitLogicQuery);
}

function renderHeroChips() {
  const wrap = document.getElementById("logicHeroChips");
  const chipHtml = HERO_PROMPTS.map(
    (p) =>
      `<button type="button" class="logic-hero-chip" data-prompt="${escapeHtml(p.prompt)}">${escapeHtml(p.label)}</button>`
  ).join("");
  if (wrap) wrap.innerHTML = chipHtml;
  bindPromptButtons();
}

function bindPromptButtons() {
  document.querySelectorAll("[data-prompt]").forEach((btn) => {
    if (btn.dataset.logicBound) return;
    btn.dataset.logicBound = "1";
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt || "";
      submitLogicQuery(p);
      ["logicHeroInput", "logicSearchInput"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      closeLogicSearch();
    });
  });
}

async function hydrateLogicChrome() {
  renderHeroChips();
  mountLogicContextSidebar(submitLogicQuery);
  window.refreshLogicContextSidebar = () => refreshLogicContextSidebar(submitLogicQuery);
  await hydrateLogicMarketState();
  refreshLogicContextSidebar(submitLogicQuery);
}

function bindForms() {
  const onSubmit = (e, getValue, clearInputs) => {
    e.preventDefault();
    e.stopPropagation();
    submitLogicQuery(getValue());
    clearInputs();
    closeLogicSearch();
    return false;
  };

  document.getElementById("logicHeroForm")?.addEventListener("submit", (e) =>
    onSubmit(
      e,
      () => document.getElementById("logicHeroInput")?.value,
      () => {
        const el = document.getElementById("logicHeroInput");
        if (el) el.value = "";
      }
    )
  );

  document.getElementById("logicSearchForm")?.addEventListener("submit", (e) =>
    onSubmit(
      e,
      () =>
        document.getElementById("logicSearchInput")?.value ||
        document.getElementById("logicHeroInput")?.value ||
        "",
      () => {
        ["logicSearchInput", "logicHeroInput"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
      }
    )
  );

  document.getElementById("logicSearchClose")?.addEventListener("click", closeLogicSearch);
  document.getElementById("logicSearchOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "logicSearchOverlay") closeLogicSearch();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("page-logic")?.classList.contains("active")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLogicSearch();
    }
    if (e.key === "Escape") closeLogicSearch();
  });
}

function bindLogicUI() {
  const sidebar = document.getElementById("logicModeSidebar");
  const terminal = isLogicTerminalUser();
  if (sidebar) {
    sidebar.innerHTML = LOGIC_MODES.map((m) => {
      const locked = !terminal && PREMIUM_LOGIC_MODES.has(m.id);
      return `<button type="button" class="logic-mode-btn${m.id === activeMode ? " active" : ""}${locked ? " logic-mode-btn--locked" : ""}" data-mode="${m.id}" data-locked="${locked ? "1" : "0"}">
          <span class="logic-mode-icon">${m.icon}</span>
          <span class="logic-mode-label">${escapeHtml(m.label)}${locked ? " · Terminal" : ""}</span>
          <span class="logic-mode-desc">${escapeHtml(m.desc)}</span>
        </button>`;
    }).join("");

    sidebar.querySelectorAll(".logic-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.locked === "1") {
          submitLogicQuery(
            btn.dataset.mode === "portfolio"
              ? "Analyze my portfolio"
              : btn.dataset.mode === "scenario"
                ? "What happens if rates rise?"
                : "Show me AI sector rotation"
          );
          return;
        }
        activeMode = btn.dataset.mode;
        sidebar
          .querySelectorAll(".logic-mode-btn")
          .forEach((b) => b.classList.toggle("active", b === btn));
        const prompts = {
          "market-pulse": "Explain today's market",
          ticker: "Why is Nvidia moving?",
          portfolio: "Analyze my portfolio",
          "sector-rotation": "Show me AI sector rotation",
          "risk-regime": "Show risk regime",
          "daily-brief": "Give me today's market brief",
          scenario: "What happens if rates rise?",
        };
        const p = prompts[activeMode] || "";
        const hero = document.getElementById("logicHeroInput");
        if (hero) hero.value = p;
      });
    });
  }
  bindForms();
}

function openLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  if (overlay) {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  }
  const searchInput = document.getElementById("logicSearchInput");
  const hero = document.getElementById("logicHeroInput");
  (searchInput || hero)?.focus();
}

function closeLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  if (overlay) {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }
}

export function isLogicPreview() {
  return PREVIEW_KEYS.has(new URLSearchParams(location.search).get("preview"));
}

function canInitLogic() {
  return isLogicPreview() || !!window._clerkUser;
}

function showLogicNav() {
  const tab = document.getElementById("navLogicTab");
  const pill = document.getElementById("logicPreviewPill");
  if (!tab) return;
  const visible = isLogicPreview() || !!window._clerkUser;
  if (visible) tab.style.display = "inline-flex";
  if (isLogicPreview()) {
    document.documentElement.classList.add("preview-logic");
    if (pill) pill.style.display = "";
  } else if (pill) {
    pill.style.display = "none";
  }
}

function refreshLogicPageChrome() {
  const previewBadge = document.querySelector(".logic-preview-badge");
  const headerSub = document.querySelector(".logic-header-sub");
  if (previewBadge) previewBadge.style.display = isLogicPreview() ? "" : "none";
  if (headerSub) {
    headerSub.textContent = isLogicTerminalUser()
      ? "Logic Terminal · Institutional intelligence · Not financial advice"
      : "Free Logic · Limited daily prompts · Not financial advice";
  }
  updateUsageBanner();
}

function hookLogicRoute() {
  if (window.__logicRouteHooked || typeof window.route !== "function") return;
  const orig = window.route;
  window.__logicRouteHooked = true;
  window.route = function (name) {
    orig(name);
    if (name === "logic") setTimeout(tryInitLogicPage, 0);
  };
}

export function initLogicPage() {
  if (logicPageInitialized) return;
  if (!canInitLogic()) return;
  logicPageInitialized = true;

  window.__LOGIC_PREVIEW = true;
  window.submitLogicQuery = submitLogicQuery;
  window.logicHandleSubmit = submitLogicQuery;

  logicLog("init", isLogicTerminalUser() ? "Logic Terminal ready" : "Logic Free ready");

  showLogicNav();
  refreshLogicPageChrome();
  bindLogicUI();
  mountLogicPortfolioPanel();
  hydrateLogicChrome();
  updateUsageBanner();

  if (window.__logicPendingPrompt) {
    const pending = window.__logicPendingPrompt;
    delete window.__logicPendingPrompt;
    submitLogicQuery(pending);
  }

  setTimeout(() => document.getElementById("logicHeroInput")?.focus(), 400);
}

function tryInitLogicPage() {
  if (!document.getElementById("page-logic")) return;
  if (!canInitLogic()) return;
  initLogicPage();
}

function bootstrapLogicModule() {
  window.submitLogicQuery = submitLogicQuery;
  window.logicHandleSubmit = submitLogicQuery;
  window.btInitLogicForUser = () => {
    showLogicNav();
    refreshLogicPageChrome();
    tryInitLogicPage();
    if (logicPageInitialized) bindLogicUI();
  };

  hookLogicRoute();
  if (typeof window.route !== "function") {
    setTimeout(hookLogicRoute, 50);
  }

  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  if (isLogicPreview() || tab === "logic" || tab === "agent") {
    if (typeof window.route === "function") window.route("logic");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInitLogicPage);
  } else {
    tryInitLogicPage();
  }
  window.addEventListener("load", tryInitLogicPage);

  const clerkPoll = setInterval(() => {
    if (window._clerkUser) {
      showLogicNav();
      if (document.getElementById("page-logic")?.classList.contains("active")) {
        tryInitLogicPage();
      }
      clearInterval(clerkPoll);
    }
  }, 250);
  setTimeout(() => clearInterval(clerkPoll), 10000);
}

/** @deprecated */
export const initLogicPreview = initLogicPage;

bootstrapLogicModule();
