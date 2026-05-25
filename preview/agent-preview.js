/**
 * Brieftick AI Market Agent — preview UI (page + components).
 * Activate: ?preview=agent  or  ?tab=agent&preview=agent
 */
import { AGENT_MODES } from "../agents/types.js";
import { detectAgentMode, routeAgentPrompt } from "../agents/agentRouter.js";
import { runMarketPulseAgent } from "../agents/marketPulseAgent.js";
import { runRiskRegimeAgent } from "../agents/riskRegimeAgent.js";

const PREVIEW_KEY = "agent";
const isAgentPreview = () =>
  new URLSearchParams(location.search).get("preview") === PREVIEW_KEY;

/** @type {import('../agents/types.js').AgentMode} */
let activeMode = "market-pulse";
let chatHistory = [];
let isProcessing = false;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResponseCard(res, role = "agent") {
  const drivers = (res.keyDrivers || [])
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("");
  const signals = (res.signals || [])
    .map(
      (s) =>
        `<span class="agent-signal-chip">${escapeHtml(s)}</span>`
    )
    .join("");
  const meta = [
    res.usedAI ? "AI enriched" : null,
    res.mockData ? "Sample / partial data" : null,
    `Confidence ${res.confidence}%`,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="agent-msg agent-msg--${role}">
    <div class="agent-msg-head">
      <span class="agent-msg-role">${role === "user" ? "You" : "Brieftick Agent"}</span>
      ${res.mode ? `<span class="agent-msg-mode">${escapeHtml(res.mode)}</span>` : ""}
    </div>
    <h3 class="agent-msg-title">${escapeHtml(res.title)}</h3>
    <p class="agent-msg-summary">${escapeHtml(res.summary)}</p>
    ${drivers ? `<ul class="agent-msg-drivers">${drivers}</ul>` : ""}
    ${signals ? `<div class="agent-signal-row">${signals}</div>` : ""}
    <div class="agent-msg-foot">
      <span>${escapeHtml(meta)}</span>
      <span class="agent-msg-sources">${escapeHtml((res.sources || []).join(" · "))}</span>
    </div>
    <p class="agent-disclaimer">${escapeHtml(res.disclaimer)}</p>
  </div>`;
}

function renderUserBubble(text) {
  return `<div class="agent-msg agent-msg--user">
    <div class="agent-msg-head"><span class="agent-msg-role">You</span></div>
    <p class="agent-msg-summary">${escapeHtml(text)}</p>
  </div>`;
}

function scrollChatToBottom() {
  const el = document.getElementById("agentChatMessages");
  if (el) el.scrollTop = el.scrollHeight;
}

async function handleSubmit(promptText) {
  const prompt = (promptText || "").trim();
  if (!prompt || isProcessing) return;

  const chat = document.getElementById("agentChatMessages");
  if (!chat) return;

  isProcessing = true;
  chat.insertAdjacentHTML("beforeend", renderUserBubble(prompt));
  chat.insertAdjacentHTML(
    "beforeend",
    `<div class="agent-msg agent-msg--loading" id="agentLoading"><span class="agent-loading-dot"></span> Analyzing market context…</div>`
  );
  scrollChatToBottom();

  const mode = detectAgentMode(prompt);
  activeMode = mode;
  document
    .querySelectorAll(".agent-mode-btn")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );

  try {
    const response = await routeAgentPrompt(prompt, mode);
    chatHistory.push({ role: "user", text: prompt }, { role: "agent", response });
    document.getElementById("agentLoading")?.remove();
    chat.insertAdjacentHTML("beforeend", renderResponseCard(response));
    updateInsightWidgets(response);
  } catch (e) {
    document.getElementById("agentLoading")?.remove();
    chat.insertAdjacentHTML(
      "beforeend",
      `<div class="agent-msg agent-msg--error">Unable to complete analysis. ${escapeHtml(e.message)}</div>`
    );
  }

  isProcessing = false;
  scrollChatToBottom();
}

function updateInsightWidgets(lastResponse) {
  const pulseEl = document.getElementById("agentWidgetPulse");
  const riskEl = document.getElementById("agentWidgetRisk");
  if (pulseEl && lastResponse?.mode === "market-pulse") {
    pulseEl.innerHTML = `<div class="agent-widget-val">${escapeHtml(lastResponse.signals?.[0] || "Mixed")}</div>
      <p class="agent-widget-copy">${escapeHtml(lastResponse.summary.slice(0, 140))}…</p>`;
  }
  if (riskEl && lastResponse?.mode === "risk-regime") {
    riskEl.innerHTML = `<div class="agent-widget-val">${escapeHtml(lastResponse.signals?.[0] || "Mixed")}</div>
      <p class="agent-widget-copy">${escapeHtml(lastResponse.summary.slice(0, 140))}…</p>`;
  }
}

async function refreshWidgets() {
  try {
    const [pulse, risk] = await Promise.all([
      runMarketPulseAgent("market pulse"),
      runRiskRegimeAgent("risk regime"),
    ]);
    const pulseEl = document.getElementById("agentWidgetPulse");
    const riskEl = document.getElementById("agentWidgetRisk");
    if (pulseEl) {
      pulseEl.innerHTML = `<div class="agent-widget-val">${escapeHtml(pulse.signals?.[0] || "Mixed")}</div>
        <p class="agent-widget-copy">${escapeHtml(pulse.summary.slice(0, 150))}…</p>`;
    }
    if (riskEl) {
      riskEl.innerHTML = `<div class="agent-widget-val">${escapeHtml(risk.signals?.[0] || "Mixed")}</div>
        <p class="agent-widget-copy">${escapeHtml(risk.summary.slice(0, 150))}…</p>`;
    }
  } catch (_) {}
}

function bindAgentUI() {
  const sidebar = document.getElementById("agentModeSidebar");
  if (sidebar) {
    sidebar.innerHTML = AGENT_MODES.map(
      (m) =>
        `<button type="button" class="agent-mode-btn${m.id === activeMode ? " active" : ""}" data-mode="${m.id}">
          <span class="agent-mode-icon">${m.icon}</span>
          <span class="agent-mode-label">${escapeHtml(m.label)}</span>
          <span class="agent-mode-desc">${escapeHtml(m.desc)}</span>
        </button>`
    ).join("");

    sidebar.querySelectorAll(".agent-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeMode = btn.dataset.mode;
        sidebar
          .querySelectorAll(".agent-mode-btn")
          .forEach((b) => b.classList.toggle("active", b === btn));
        const prompts = {
          "market-pulse": "Explain today's overall market direction",
          ticker: "Why is NVDA moving today?",
          portfolio: "Analyze my portfolio exposure",
          "sector-rotation": "Explain sector rotation today",
          "risk-regime": "Show the current risk regime",
          "daily-brief": "Give me today's market brief",
          scenario: "What happens if rates rise?",
        };
        const input = document.getElementById("agentCommandInput");
        if (input) input.value = prompts[activeMode] || "";
      });
    });
  }

  const form = document.getElementById("agentCommandForm");
  const input = document.getElementById("agentCommandInput");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit(input?.value);
    if (input) input.value = "";
  });

  document.querySelectorAll(".agent-quick-prompt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.prompt || "";
      if (input) input.value = p;
      handleSubmit(p);
      if (input) input.value = "";
    });
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("page-agent")?.classList.contains("active")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input?.focus();
    }
  });
}

function showWelcome() {
  const chat = document.getElementById("agentChatMessages");
  if (!chat || chat.dataset.welcome) return;
  chat.dataset.welcome = "1";
  chat.innerHTML = `<div class="agent-welcome">
    <h3>Understand what moves markets.</h3>
    <p>Ask for explanations — not trade ideas. I interpret macro tone, tickers, sectors, risk, and portfolio exposure in plain English.</p>
    <div class="agent-quick-prompts">
      <button type="button" class="agent-quick-prompt" data-prompt="Why is Nvidia moving?">Why is NVDA moving?</button>
      <button type="button" class="agent-quick-prompt" data-prompt="Explain today's market">Explain today's market</button>
      <button type="button" class="agent-quick-prompt" data-prompt="Analyze my portfolio">Analyze my portfolio</button>
      <button type="button" class="agent-quick-prompt" data-prompt="Show risk regime">Show risk regime</button>
    </div>
  </div>`;
}

export function initAgentPreview() {
  if (!isAgentPreview()) return;

  window.__AGENT_PREVIEW = true;
  document.documentElement.classList.add("preview-agent");

  const tab = document.getElementById("navAgentTab");
  if (tab) tab.style.display = "";

  bindAgentUI();
  showWelcome();
  refreshWidgets();

  if (typeof window.route === "function") {
    window.route("agent");
  }

  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "agent" || params.get("preview") === PREVIEW_KEY) {
    setTimeout(() => window.route?.("agent"), 50);
  }
}

if (isAgentPreview()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAgentPreview);
  } else {
    initAgentPreview();
  }
  window.addEventListener("load", () => setTimeout(initAgentPreview, 200));
}

export { handleSubmit as agentHandleSubmit, isAgentPreview };
