/**
 * Brieftick Logic — preview UI (Logic Terminal).
 * Activate: ?preview=logic  or  ?tab=logic&preview=logic
 * Legacy: ?preview=agent redirects to Logic preview.
 */
import { LOGIC_MODES } from "../logic/types.js";
import { detectLogicMode, routeLogicPrompt } from "../logic/logicRouter.js";
import { resolvePrimaryEntity } from "../logic/entityResolver.js";
import { runMarketPulseLogic } from "../logic/marketPulseLogic.js";
import { runRiskRegimeLogic } from "../logic/riskRegimeLogic.js";
import { logicDebug } from "../logic/shared.js";
import { LIMITED_DATA_MSG } from "../logic/types.js";

const PREVIEW_KEYS = new Set(["logic", "agent"]);

function getPreviewParam() {
  return new URLSearchParams(location.search).get("preview");
}

export function isLogicPreview() {
  return PREVIEW_KEYS.has(getPreviewParam());
}

/** @type {import('../logic/types.js').LogicMode} */
let activeMode = "market-pulse";
let isProcessing = false;

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

  return `<div class="logic-msg logic-msg--${role}">
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

async function handleSubmit(promptText) {
  const prompt = (promptText || "").trim();
  if (!prompt || isProcessing) return;

  const chat = document.getElementById("logicChatMessages");
  if (!chat) return;

  isProcessing = true;
  chat.insertAdjacentHTML("beforeend", renderUserBubble(prompt));
  chat.insertAdjacentHTML(
    "beforeend",
    `<div class="logic-msg logic-msg--loading" id="logicLoading"><span class="logic-loading-dot"></span> Processing intelligence…</div>`
  );
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

function updateInsightWidgets(lastResponse) {
  const pulseEl = document.getElementById("logicWidgetPulse");
  const riskEl = document.getElementById("logicWidgetRisk");
  if (pulseEl && lastResponse?.mode === "market-pulse") {
    pulseEl.innerHTML = `<div class="logic-widget-val">${escapeHtml(lastResponse.signals?.[0] || "Mixed")}</div>
      <p class="logic-widget-copy">${escapeHtml((lastResponse.cards?.snapshot || lastResponse.summary).slice(0, 140))}…</p>`;
  }
  if (riskEl && lastResponse?.mode === "risk-regime") {
    riskEl.innerHTML = `<div class="logic-widget-val">${escapeHtml(lastResponse.signals?.[0] || "Mixed")}</div>
      <p class="logic-widget-copy">${escapeHtml((lastResponse.cards?.snapshot || lastResponse.summary).slice(0, 140))}…</p>`;
  }
}

async function refreshWidgets() {
  try {
    const [pulse, risk] = await Promise.all([
      runMarketPulseLogic({ prompt: "market pulse" }),
      runRiskRegimeLogic({ prompt: "risk regime" }),
    ]);
    const pulseEl = document.getElementById("logicWidgetPulse");
    const riskEl = document.getElementById("logicWidgetRisk");
    if (pulseEl) {
      pulseEl.innerHTML = `<div class="logic-widget-val">${escapeHtml(pulse.signals?.[0] || "Mixed")}</div>
        <p class="logic-widget-copy">${escapeHtml((pulse.cards?.snapshot || pulse.summary).slice(0, 150))}…</p>`;
    }
    if (riskEl) {
      riskEl.innerHTML = `<div class="logic-widget-val">${escapeHtml(risk.signals?.[0] || "Mixed")}</div>
        <p class="logic-widget-copy">${escapeHtml((risk.cards?.snapshot || risk.summary).slice(0, 150))}…</p>`;
    }
  } catch (_) {}
}

function openLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  const input = document.getElementById("logicCommandInput");
  if (overlay) {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  }
  const searchInput = document.getElementById("logicSearchInput");
  (searchInput || input)?.focus();
}

function closeLogicSearch() {
  const overlay = document.getElementById("logicSearchOverlay");
  if (overlay) {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }
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
          "market-pulse": "Explain today's overall market direction",
          ticker: "What is the latest news on Nvidia?",
          portfolio: "Analyze my portfolio exposure",
          "sector-rotation": "Show me AI sector rotation",
          "risk-regime": "What is today's market risk?",
          "daily-brief": "Give me today's market brief",
          scenario: "What happens if rates rise?",
        };
        const input = document.getElementById("logicCommandInput");
        if (input) input.value = prompts[activeMode] || "";
      });
    });
  }

  const form = document.getElementById("logicCommandForm");
  const input = document.getElementById("logicCommandInput");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit(input?.value);
    if (input) input.value = "";
    closeLogicSearch();
  });

  const searchForm = document.getElementById("logicSearchForm");
  const searchInput = document.getElementById("logicSearchInput");
  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit(searchInput?.value || input?.value);
    if (searchInput) searchInput.value = "";
    if (input) input.value = "";
    closeLogicSearch();
  });

  document.querySelectorAll(".logic-quick-prompt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt || "";
      handleSubmit(p);
      if (input) input.value = "";
      closeLogicSearch();
    });
  });

  document.getElementById("logicSearchClose")?.addEventListener("click", closeLogicSearch);
  document.getElementById("logicSearchOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "logicSearchOverlay") closeLogicSearch();
  });

  document.addEventListener("keydown", (e) => {
    const onLogicPage = document.getElementById("page-logic")?.classList.contains("active");
    if (!onLogicPage) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLogicSearch();
    }
    if (e.key === "Escape") closeLogicSearch();
  });
}

function showWelcome() {
  const chat = document.getElementById("logicChatMessages");
  if (!chat || chat.dataset.welcome) return;
  chat.dataset.welcome = "1";
  chat.innerHTML = `<div class="logic-welcome">
    <h3>Understand what moves markets.</h3>
    <p>Brieftick Logic interprets macro tone, tickers, sectors, risk, and portfolio exposure in plain English — not trade ideas.</p>
    <div class="logic-quick-prompts">
      <button type="button" class="logic-quick-prompt" data-prompt="What is the latest news on Nvidia?">Latest news on Nvidia</button>
      <button type="button" class="logic-quick-prompt" data-prompt="Why is Tesla moving?">Why is Tesla moving?</button>
      <button type="button" class="logic-quick-prompt" data-prompt="Analyze my portfolio">Analyze my portfolio</button>
      <button type="button" class="logic-quick-prompt" data-prompt="What is today's market risk?">Today's market risk</button>
    </div>
  </div>`;
}

export function initLogicPreview() {
  if (!isLogicPreview()) return;

  window.__LOGIC_PREVIEW = true;
  window.__AGENT_PREVIEW = true;
  document.documentElement.classList.add("preview-logic");

  const tab = document.getElementById("navLogicTab");
  if (tab) tab.style.display = "";

  bindLogicUI();
  showWelcome();
  refreshWidgets();

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

export { handleSubmit as logicHandleSubmit, isLogicPreview };
