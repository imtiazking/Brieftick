/**
 * Brieftick Logic — preview UI (Logic Terminal).
 * Activate: ?preview=logic  or  ?tab=logic&preview=logic
 */
import { LOGIC_MODES } from "../logic/types.js";
import { detectLogicMode, routeLogicPrompt } from "../logic/logicRouter.js";
import { resolvePrimaryEntity } from "../logic/entityResolver.js";
import { runMarketPulseLogic } from "../logic/marketPulseLogic.js";
import { runRiskRegimeLogic } from "../logic/riskRegimeLogic.js";
import {
  getHeadlines,
  getWatchlist,
  logicDebug,
} from "../logic/shared.js";
import { LIMITED_DATA_MSG } from "../logic/types.js";

const PREVIEW_KEYS = new Set(["logic", "agent"]);

const HERO_PROMPTS = [
  { label: "Why is Nvidia moving?", prompt: "Why is Nvidia moving?" },
  { label: "Analyze my portfolio", prompt: "Analyze my portfolio" },
  { label: "Show risk regime", prompt: "Show risk regime" },
  { label: "Explain today's market", prompt: "Explain today's market" },
  { label: "AI sector rotation", prompt: "Show me AI sector rotation" },
];

const DEFAULT_WATCH = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "META"];

let activeMode = "market-pulse";
let isProcessing = false;
let hasConversation = false;

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

function widgetSkeleton() {
  return `<div class="logic-skeleton-block">
    <div class="logic-skeleton logic-skel-val"></div>
    <div class="logic-skeleton logic-skel-line logic-skel-line--med"></div>
    <div class="logic-skeleton logic-skel-line logic-skel-line--short"></div>
  </div>`;
}

function hubBlockSkeleton(lines = 3) {
  let html = "";
  for (let i = 0; i < lines; i++) {
    html += `<div class="logic-skeleton logic-skel-line${i === 0 ? " logic-skel-line--med" : " logic-skel-line--short"}"></div>`;
  }
  return html;
}

function renderLoadingState() {
  return `<div class="logic-msg logic-msg--loading" id="logicLoading">
    <div class="logic-processing">
      <span class="logic-processing-glow"></span>
      <span>Processing intelligence…</span>
    </div>
    <div class="logic-loading-skeleton">
      <div class="logic-skeleton"></div>
      <div class="logic-skeleton"></div>
      <div class="logic-skeleton"></div>
      <div class="logic-skeleton"></div>
    </div>
  </div>`;
}

function renderIntelligenceCard(res, role = "logic") {
  const cards = res.cards || {};
  const sections = CARD_SECTIONS.map(([key, label]) => {
    const text = cards[key];
    if (!text) return "";
    const full = key === "aiSummary" ? " logic-intel-section--full" : "";
    return `<div class="logic-intel-section${full}">
      <div class="logic-intel-label">${escapeHtml(label)}</div>
      <p class="logic-intel-text">${escapeHtml(text)}</p>
    </div>`;
  }).join("");

  const signals = (res.signals || [])
    .map((s) => `<span class="logic-signal-chip">${escapeHtml(s)}</span>`)
    .join("");

  const meta = [
    res.usedAI ? "Logic enriched" : null,
    res.dataLimited || res.mockData ? "Partial / delayed data" : null,
    `Confidence ${res.confidence}%`,
    res.primarySymbol ? res.primarySymbol : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const limitedBanner =
    res.dataLimited || res.mockData
      ? `<p class="logic-limited-banner">${escapeHtml(LIMITED_DATA_MSG)}</p>`
      : "";

  return `<div class="logic-msg logic-msg--logic">
    <div class="logic-msg-head">
      <span class="logic-msg-role">${role === "user" ? "You" : "Brieftick Logic"}</span>
      ${res.mode ? `<span class="logic-msg-mode">${escapeHtml(res.modeLabel || res.mode)}</span>` : ""}
    </div>
    <h3 class="logic-msg-title">${escapeHtml(res.title)}</h3>
    ${limitedBanner}
    <div class="logic-intel-card">${sections}</div>
    ${signals ? `<div class="logic-signal-row">${signals}</div>` : ""}
    <div class="logic-msg-foot">
      <span>${escapeHtml(meta)}</span>
      <span class="logic-msg-sources">${escapeHtml((res.sources || []).join(" · "))}</span>
    </div>
    <p class="logic-disclaimer">${escapeHtml(res.disclaimer)}</p>
  </div>`;
}

function renderUserBubble(text) {
  return `<div class="logic-msg logic-msg--user">
    <div class="logic-msg-head"><span class="logic-msg-role">You</span></div>
    <p class="logic-msg-summary">${escapeHtml(text)}</p>
  </div>`;
}

function scrollChatToBottom() {
  const el = document.getElementById("logicChatMessages");
  if (el) el.scrollTop = el.scrollHeight;
}

function enrichResponseMeta(res, prompt) {
  const primary = resolvePrimaryEntity(prompt);
  const modeMeta = LOGIC_MODES.find((m) => m.id === res.mode);
  return {
    ...res,
    primarySymbol: primary.symbol || undefined,
    modeLabel: modeMeta?.label || res.mode,
  };
}

function activateConversationMode() {
  if (hasConversation) return;
  hasConversation = true;
  document.getElementById("logicMain")?.classList.add("logic-main--active");
}

async function handleSubmit(promptText) {
  const prompt = (promptText || "").trim();
  if (!prompt || isProcessing) return;

  const chat = document.getElementById("logicChatMessages");
  if (!chat) return;

  activateConversationMode();
  isProcessing = true;
  chat.insertAdjacentHTML("beforeend", renderUserBubble(prompt));
  chat.insertAdjacentHTML("beforeend", renderLoadingState());
  scrollChatToBottom();

  const primary = resolvePrimaryEntity(prompt);
  const mode = detectLogicMode(prompt, primary);
  activeMode = mode;
  document
    .querySelectorAll(".logic-mode-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

  try {
    const response = enrichResponseMeta(await routeLogicPrompt(prompt, mode), prompt);
    document.getElementById("logicLoading")?.remove();
    chat.insertAdjacentHTML("beforeend", renderIntelligenceCard(response));
    updateInsightWidgets(response);
    updateHubFromResponse(response);
  } catch (e) {
    logicDebug("handler_error", { message: e.message });
    document.getElementById("logicLoading")?.remove();
    chat.insertAdjacentHTML(
      "beforeend",
      renderIntelligenceCard(
        enrichResponseMeta(
          {
            title: "Logic · Contextual read",
            summary: LIMITED_DATA_MSG,
            cards: {
              snapshot: LIMITED_DATA_MSG,
              catalyst: "Headline channel may be delayed",
              macroContext: "Macro backdrop still applies from prior session tone",
              sectorImpact: "Sector narrative inferred from theme mapping",
              volatility: "Volatility regime unchanged pending live confirm",
              aiSummary:
                "Historical context and sector narrative remain available while live feeds catch up.",
            },
            keyDrivers: ["Delayed live feed", "Contextual inference"],
            signals: ["Data limited"],
            confidence: 45,
            sources: ["Brieftick Logic"],
            disclaimer: "Market intelligence, not financial advice.",
            dataLimited: true,
            mockData: true,
          },
          prompt
        )
      )
    );
  }

  isProcessing = false;
  scrollChatToBottom();
}

function updateHubFromResponse(res) {
  if (res.mode === "market-pulse") {
    const el = document.getElementById("logicHubPulse");
    if (el)
      el.innerHTML = `<div class="logic-widget-val logic-widget-body--loaded">${escapeHtml(res.signals?.[0] || "Mixed")}</div>
        <p class="logic-widget-copy">${escapeHtml((res.cards?.snapshot || "").slice(0, 120))}</p>`;
  }
  if (res.mode === "risk-regime") {
    const el = document.getElementById("logicHubRisk");
    if (el) {
      el.innerHTML = (res.signals || [])
        .map(
          (s) =>
            `<span class="logic-risk-pill logic-widget-body--loaded"><span class="logic-risk-dot"></span>${escapeHtml(s)}</span>`
        )
        .join("");
    }
  }
}

function updateInsightWidgets(lastResponse) {
  const pulseEl = document.getElementById("logicWidgetPulse");
  const riskEl = document.getElementById("logicWidgetRisk");
  const pulseHtml = (res) =>
    `<div class="logic-widget-val logic-widget-body--loaded">${escapeHtml(res.signals?.[0] || "Mixed")}</div>
      <p class="logic-widget-copy">${escapeHtml((res.cards?.snapshot || res.summary).slice(0, 140))}…</p>`;
  if (pulseEl && lastResponse?.mode === "market-pulse") pulseEl.innerHTML = pulseHtml(lastResponse);
  if (riskEl && lastResponse?.mode === "risk-regime") riskEl.innerHTML = pulseHtml(lastResponse);
}

function setWidgetSkeletons() {
  const sk = widgetSkeleton();
  document.getElementById("logicWidgetPulse")?.insertAdjacentHTML("afterbegin", sk);
  document.getElementById("logicWidgetRisk")?.insertAdjacentHTML("afterbegin", sk);
  document.getElementById("logicHubPulse")?.innerHTML = hubBlockSkeleton(2);
  document.getElementById("logicHubVol")?.innerHTML = hubBlockSkeleton(2);
  document.getElementById("logicHubMacro")?.innerHTML = hubBlockSkeleton(3);
  document.getElementById("logicHubRisk")?.innerHTML = hubBlockSkeleton(1);
  document.getElementById("logicStreamInner")?.innerHTML = hubBlockSkeleton(4);
}

function renderHeroChips() {
  const wrap = document.getElementById("logicHeroChips");
  const grid = document.getElementById("logicSuggestGrid");
  const chipHtml = HERO_PROMPTS.map(
    (p) =>
      `<button type="button" class="logic-hero-chip" data-prompt="${escapeHtml(p.prompt)}">${escapeHtml(p.label)}</button>`
  ).join("");
  if (wrap) wrap.innerHTML = chipHtml;
  if (grid) {
    grid.innerHTML = HERO_PROMPTS.map(
      (p) =>
        `<button type="button" class="logic-suggest-card" data-prompt="${escapeHtml(p.prompt)}">
          <strong>${escapeHtml(p.label)}</strong>
          <span>Run ${escapeHtml(p.label.toLowerCase())} through Brieftick Logic</span>
        </button>`
    ).join("");
  }
  bindPromptButtons();
}

function bindPromptButtons() {
  document.querySelectorAll("[data-prompt]").forEach((btn) => {
    if (btn.dataset.logicBound) return;
    btn.dataset.logicBound = "1";
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt || "";
      const hero = document.getElementById("logicHeroInput");
      const bottom = document.getElementById("logicCommandInput");
      if (hero) hero.value = p;
      if (bottom) bottom.value = p;
      handleSubmit(p);
      if (hero) hero.value = "";
      if (bottom) bottom.value = "";
      closeLogicSearch();
    });
  });
}

function renderNarrativeFeed(headlines, live) {
  const inner = document.getElementById("logicStreamInner");
  const status = document.getElementById("logicStreamStatus");
  if (!inner) return;

  const items =
    headlines.length > 0
      ? headlines
      : [
          { headline: "Mega-cap tech anchors index tone as breadth stays selective", source: "Desk" },
          { headline: "Rate expectations remain the primary cross-asset driver", source: "Macro" },
          { headline: "Energy complex firm on supply narrative", source: "Commodities" },
          { headline: "Volatility monitored into macro data prints", source: "Risk" },
        ];

  const doubled = [...items, ...items];
  inner.innerHTML = doubled
    .map(
      (n, i) =>
        `<div class="logic-stream-item logic-widget-body--loaded" style="animation-delay:${(i % 4) * 0.08}s">
          <time>${escapeHtml(n.source || "Narrative")}</time>
          ${escapeHtml((n.headline || "").slice(0, 140))}
        </div>`
    )
    .join("");

  if (status) status.textContent = live ? "Live feed" : "Contextual feed";
}

function renderWatchlistHub() {
  const el = document.getElementById("logicHubWatchlist");
  if (!el) return;
  const list = getWatchlist();
  const symbols = list.length ? list.slice(0, 8) : DEFAULT_WATCH;
  el.innerHTML = symbols
    .map(
      (s) =>
        `<button type="button" class="logic-watch-pill" data-prompt="Why is ${escapeHtml(s)} moving?">${escapeHtml(s)}</button>`
    )
    .join("");
  bindPromptButtons();
}

function renderMacroHub(headlines) {
  const el = document.getElementById("logicHubMacro");
  if (!el) return;
  const lines =
    headlines.length > 0
      ? headlines.slice(0, 4)
      : [
          { headline: "Fed speakers lean cautious on near-term cuts" },
          { headline: "Inflation path still anchors rate expectations" },
          { headline: "Dollar tone influences risk appetite" },
        ];
  el.innerHTML = lines
    .map(
      (n) =>
        `<div class="logic-macro-line logic-widget-body--loaded">${escapeHtml((n.headline || "").slice(0, 100))}</div>`
    )
    .join("");
}

async function hydrateIntelligenceHub() {
  setWidgetSkeletons();
  renderHeroChips();
  renderWatchlistHub();

  const newsPack = await getHeadlines(8);
  renderNarrativeFeed(newsPack.headlines, newsPack.live);
  renderMacroHub(newsPack.headlines);

  try {
    const [pulse, risk] = await Promise.all([
      runMarketPulseLogic({ prompt: "market pulse" }),
      runRiskRegimeLogic({ prompt: "risk regime" }),
    ]);

    const pulseEl = document.getElementById("logicWidgetPulse");
    const riskEl = document.getElementById("logicWidgetRisk");
    const hubPulse = document.getElementById("logicHubPulse");
    const hubVol = document.getElementById("logicHubVol");
    const hubRisk = document.getElementById("logicHubRisk");

    const pulseBody = `<div class="logic-widget-val logic-widget-body--loaded">${escapeHtml(pulse.signals?.[0] || "Mixed")}</div>
      <p class="logic-widget-copy">${escapeHtml((pulse.cards?.snapshot || pulse.summary).slice(0, 130))}</p>`;
    const volBody = `<div class="logic-widget-val logic-widget-body--loaded">${escapeHtml(pulse.signals?.[1] || "Monitored")}</div>
      <p class="logic-widget-copy">${escapeHtml((pulse.cards?.volatility || "Volatility channel active").slice(0, 100))}</p>`;
    const riskBody = `<div class="logic-widget-val logic-widget-body--loaded">${escapeHtml(risk.signals?.[0] || "Mixed")}</div>
      <p class="logic-widget-copy">${escapeHtml((risk.cards?.snapshot || risk.summary).slice(0, 130))}</p>`;
    const riskPills = (risk.signals || ["Mixed", "Macro monitored"])
      .map(
        (s) =>
          `<span class="logic-risk-pill logic-widget-body--loaded"><span class="logic-risk-dot"></span>${escapeHtml(s)}</span>`
      )
      .join("");

    if (pulseEl) pulseEl.innerHTML = pulseBody;
    if (riskEl) riskEl.innerHTML = riskBody;
    if (hubPulse) hubPulse.innerHTML = pulseBody;
    if (hubVol) hubVol.innerHTML = volBody;
    if (hubRisk) hubRisk.innerHTML = riskPills;
  } catch (_) {
    logicDebug("hub_hydrate_partial", {});
  }
}

function showInitialChatHint() {
  const chat = document.getElementById("logicChatMessages");
  if (!chat || chat.dataset.hint) return;
  chat.dataset.hint = "1";
  chat.innerHTML = `<div class="logic-welcome logic-widget-body--loaded">
    <p class="logic-widget-copy" style="margin:0;font-size:12px;color:var(--ink-faint)">
      Intelligence responses appear here. Select a prompt above or type in the command bar.
    </p>
  </div>`;
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

function bindForms() {
  const submitHandler = (getValue, clear) => (e) => {
    e.preventDefault();
    handleSubmit(getValue());
    clear();
    closeLogicSearch();
  };

  document
    .getElementById("logicHeroForm")
    ?.addEventListener(
      "submit",
      submitHandler(
        () => document.getElementById("logicHeroInput")?.value,
        () => {
          const el = document.getElementById("logicHeroInput");
          if (el) el.value = "";
        }
      )
    );

  document
    .getElementById("logicCommandForm")
    ?.addEventListener(
      "submit",
      submitHandler(
        () => document.getElementById("logicCommandInput")?.value,
        () => {
          const el = document.getElementById("logicCommandInput");
          if (el) el.value = "";
        }
      )
    );

  document.getElementById("logicSearchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v =
      document.getElementById("logicSearchInput")?.value ||
      document.getElementById("logicHeroInput")?.value ||
      "";
    handleSubmit(v);
    ["logicSearchInput", "logicHeroInput", "logicCommandInput"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    closeLogicSearch();
  });

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
  if (sidebar) {
    sidebar.innerHTML = LOGIC_MODES.map(
      (m) =>
        `<button type="button" class="logic-mode-btn${m.id === activeMode ? " active" : ""}" data-mode="${m.id}">
          <span class="logic-mode-icon">${m.icon}</span>
          <span class="logic-mode-label">${escapeHtml(m.label)}</span>
          <span class="logic-mode-desc">${escapeHtml(m.desc)}</span>
        </button>`
    ).join("");

    sidebar.querySelectorAll(".logic-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
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
        const bottom = document.getElementById("logicCommandInput");
        if (hero) hero.value = p;
        if (bottom) bottom.value = p;
      });
    });
  }
  bindForms();
}

export function isLogicPreview() {
  return PREVIEW_KEYS.has(new URLSearchParams(location.search).get("preview"));
}

export function initLogicPreview() {
  if (!isLogicPreview()) return;

  window.__LOGIC_PREVIEW = true;
  window.__AGENT_PREVIEW = true;
  window.logicHandleSubmit = handleSubmit;
  document.documentElement.classList.add("preview-logic");

  const tab = document.getElementById("navLogicTab");
  if (tab) tab.style.display = "";

  bindLogicUI();
  showInitialChatHint();
  hydrateIntelligenceHub();

  if (window.__logicPendingPrompt) {
    const pending = window.__logicPendingPrompt;
    delete window.__logicPendingPrompt;
    handleSubmit(pending);
  }

  setTimeout(() => document.getElementById("logicHeroInput")?.focus(), 400);

  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "logic" || params.get("tab") === "agent" || isLogicPreview()) {
    setTimeout(() => window.route?.("logic"), 50);
  }
}

if (isLogicPreview()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLogicPreview);
  } else {
    initLogicPreview();
  }
  window.addEventListener("load", () => setTimeout(initLogicPreview, 200));
}

window.logicHandleSubmit = handleSubmit;
export { handleSubmit as logicHandleSubmit };
