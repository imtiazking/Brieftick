/**
 * Dashboard Intelligence Lab — Orbit, Deck, and Rail concepts.
 * @module preview/dashboard-design-lab
 */

import {
  RAIL_SECTIONS,
  WHEEL_SECTIONS,
  renderRailModule,
  renderRailPulseHero,
} from "./dashboard-rail-mocks.js";
import { createIntelligenceWheel } from "./dashboard-design-wheel.js";

const ORBIT_NODES = [
  { id: "flows", label: "Flows", icon: "FL" },
  { id: "sectors", label: "Sectors", icon: "SC" },
  { id: "risk", label: "Risk", icon: "RK" },
  { id: "signals", label: "Signals", icon: "SG" },
  { id: "news", label: "News", icon: "NW" },
  { id: "correlation", label: "Correlation", icon: "CR" },
  { id: "watchlist", label: "Watchlist", icon: "WL" },
  { id: "events", label: "Events", icon: "EV" },
];

const DECK_CARDS = [
  { id: "pulse", title: "Market Pulse", kicker: "Live regime" },
  { id: "movers", title: "Why Markets Are Moving", kicker: "Narrative" },
  { id: "risk", title: "Risk Regime", kicker: "Vol & credit" },
  { id: "sectors", title: "Sector Rotation", kicker: "Leadership" },
  { id: "signals", title: "Signal Feed", kicker: "Anomalies" },
  { id: "news", title: "News Intelligence", kicker: "Headlines" },
  { id: "correlation", title: "Correlation Engine", kicker: "Cross-asset" },
  { id: "watchlist", title: "Watchlist", kicker: "Your book" },
  { id: "events", title: "What To Watch", kicker: "Calendar" },
];

const MOCK = {
  pulse: {
    headline: "Risk-on, but narrow",
    body: "Megacap tech is carrying index returns while breadth only partially confirms. Rates are stable and the dollar is steady — leadership is concentrated, not broad.",
    metrics: ["S&P +0.4%", "VIX 14.2", "Breadth mixed", "Dollar flat"],
  },
  flows: {
    headline: "Institutional flow tilts growth",
    body: "ETF creations favour QQQ and SMH; financials see modest outflows. Dark-pool prints show buyers defending semis on dips.",
    metrics: ["QQQ inflow", "XLF outflow", "Semis bid", "Energy neutral"],
  },
  sectors: {
    headline: "AI complex leads, defensives lag",
    body: "Technology and communication services outperform; utilities and staples underperform on rate sensitivity. Rotation remains tactical, not regime-shifting.",
    metrics: ["Tech +1.1%", "Comm +0.8%", "Staples −0.3%", "Utils −0.2%"],
  },
  risk: {
    headline: "Transitional risk regime",
    body: "Equities hold firm while vol markets price event risk. Credit spreads are calm; front-end yields anchor the tape.",
    metrics: ["VIX firm", "HY tight", "2Y range-bound", "Skew elevated"],
  },
  signals: {
    headline: "Three live anomalies",
    body: "Unusual call activity in NVDA; breadth divergence in small caps; dollar–gold correlation breakdown intraday.",
    metrics: ["NVDA vol spike", "IWM lag", "DXY/Gold decouple", "Gamma pin SPY"],
  },
  news: {
    headline: "Macro headlines dominate",
    body: "Fed speakers and CPI preview anchor sentiment. Earnings focus shifts to mega-cap tech; geopolitical headlines muted.",
    metrics: ["Fed week", "CPI tomorrow", "NVDA earnings", "Oil steady"],
  },
  correlation: {
    headline: "Tech–rates decouple",
    body: "Nasdaq beta to 10Y moves has softened. Gold and real yields re-couple; oil tracks dollar less than seasonal norm.",
    metrics: ["NDX/10Y low", "Gold/REAL+", "Oil/DXY −", "BTC/NDX +"],
  },
  watchlist: {
    headline: "Book bias: AI tilt",
    body: "NVDA, MSFT, AMD cluster leads watchlist momentum. TSLA diverges negative; AAPL defensive within tech.",
    metrics: ["NVDA +1.2%", "TSLA −0.8%", "AAPL +0.2%", "AMD +0.9%"],
  },
  events: {
    headline: "Calendar cluster this week",
    body: "CPI tomorrow; Powell Wednesday; NVDA earnings next week. OPEC commentary and European PMIs on Friday.",
    metrics: ["CPI Tue", "Powell Wed", "NVDA earnings", "PMI Fri"],
  },
  movers: {
    headline: "Megacap earnings drive tape",
    body: "Index strength is narrative-led: AI capex, margin resilience, and buyback support. Cyclicals wait for macro confirmation.",
    metrics: ["Mag 7 +0.6%", "IWM −0.2%", "Energy flat", "Banks +0.1%"],
  },
};

let activeConcept = "orbit";
let activeOrbitId = "flows";
let activeDeckIndex = 0;
let activeRailId = "movers";
let activeWheelId = "movers";
let wheelController = null;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderIntelBody(id) {
  const data = MOCK[id] || MOCK.pulse;
  const chips = (data.metrics || [])
    .map((m) => `<span class="intel-chip">${escapeHtml(m)}</span>`)
    .join("");
  return `
    <p class="intel-surface__kicker">${escapeHtml(ORBIT_NODES.find((n) => n.id === id)?.label || DECK_CARDS.find((c) => c.id === id)?.title || "Intelligence")}</p>
    <h2 class="intel-surface__headline">${escapeHtml(data.headline)}</h2>
    <p class="intel-surface__body">${escapeHtml(data.body)}</p>
    ${chips ? `<div class="intel-surface__chips">${chips}</div>` : ""}
    <p class="intel-surface__note">Design lab mock · no live data</p>`;
}

function buildOrbitStage() {
  const stage = document.getElementById("orbitStage");
  if (!stage || stage.dataset.built) return;
  stage.dataset.built = "1";

  const radius = "min(38vmin, 320px)";
  const orbitDur = 240;
  const slots = ORBIT_NODES.map((node, i) => {
    const angle = (i / ORBIT_NODES.length) * 360;
    return `<div class="intel-orbit__slot" style="--slot-angle:${angle}deg;--orbit-radius:${radius}">
      <button type="button" class="intel-orbit__node" data-orbit-id="${node.id}" style="--slot-angle:${angle}deg;--node-delay:${i * 0.4}s" aria-pressed="false">
        <span class="intel-orbit__icon">${escapeHtml(node.icon)}</span>
        <span class="intel-orbit__label">${escapeHtml(node.label)}</span>
      </button>
    </div>`;
  }).join("");

  stage.innerHTML = `
    <div class="intel-orbit__ring" aria-hidden="true"></div>
    <div class="intel-orbit__track" style="width:${radius};height:${radius}"></div>
    <div class="intel-orbit__spinner" style="--orbit-dur:${orbitDur}s">${slots}</div>`;

  stage.querySelectorAll("[data-orbit-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectOrbitNode(btn.dataset.orbitId));
  });
}

function selectOrbitNode(id) {
  activeOrbitId = id;
  const scene = document.getElementById("orbitScene");
  const surface = document.getElementById("orbitSurface");
  if (!scene || !surface) return;

  scene.classList.add("is-focus");
  scene.dataset.focus = id;

  scene.querySelectorAll(".intel-orbit__node").forEach((btn) => {
    const on = btn.dataset.orbitId === id;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.parentElement?.classList.toggle("is-dim", !on && scene.classList.contains("is-focus"));
  });

  surface.innerHTML = renderIntelBody(id);
  surface.classList.add("is-visible");
}

function renderDeckTabs() {
  const rail = document.getElementById("deckRail");
  if (!rail) return;
  rail.innerHTML = DECK_CARDS.map(
    (c, i) =>
      `<button type="button" class="deck-tab${i === activeDeckIndex ? " is-active" : ""}" data-deck-index="${i}" aria-selected="${i === activeDeckIndex}">
        <span class="deck-tab__kicker">${escapeHtml(c.kicker)}</span>
        <span class="deck-tab__title">${escapeHtml(c.title)}</span>
      </button>`
  ).join("");

  rail.querySelectorAll(".deck-tab").forEach((btn) => {
    btn.addEventListener("click", () => selectDeckCard(Number(btn.dataset.deckIndex)));
  });
}

function selectDeckCard(index) {
  activeDeckIndex = index;
  const card = DECK_CARDS[index];
  const stage = document.getElementById("deckStage");
  const hero = document.getElementById("deckHero");
  if (!stage || !card) return;

  document.querySelectorAll(".deck-tab").forEach((tab, i) => {
    tab.classList.toggle("is-active", i === index);
    tab.setAttribute("aria-selected", i === index ? "true" : "false");
    if (i === index) tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });

  if (hero) {
    hero.innerHTML = `
      <span class="deck-hero__tag">Market Pulse</span>
      <h2 class="deck-hero__title">${escapeHtml(MOCK.pulse.headline)}</h2>
      <p class="deck-hero__body">${escapeHtml(MOCK.pulse.body)}</p>`;
  }

  stage.classList.remove("is-visible");
  requestAnimationFrame(() => {
    const bodyId = card.id === "movers" ? "movers" : card.id;
    if (card.id === "pulse") {
      const chips = (MOCK.pulse.metrics || [])
        .map((m) => `<span class="intel-chip">${escapeHtml(m)}</span>`)
        .join("");
      stage.innerHTML = `<article class="deck-card deck-card--pulse">
        <span class="deck-card__kicker">${escapeHtml(card.kicker)}</span>
        <h3 class="deck-card__title">${escapeHtml(card.title)}</h3>
        <p class="intel-surface__body">Regime summary lives in the hero above — metrics at a glance.</p>
        <div class="intel-surface__chips">${chips}</div>
        <p class="intel-surface__note">Design lab mock · no live data</p>
      </article>`;
    } else {
      stage.innerHTML = `<article class="deck-card">
        <span class="deck-card__kicker">${escapeHtml(card.kicker)}</span>
        <h3 class="deck-card__title">${escapeHtml(card.title)}</h3>
        ${renderIntelBody(bodyId)}
      </article>`;
    }
    stage.classList.add("is-visible");
  });
}

function setConcept(concept, options = {}) {
  activeConcept = concept;
  document.querySelectorAll("[data-concept]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.concept === concept);
    btn.setAttribute("aria-pressed", btn.dataset.concept === concept ? "true" : "false");
  });
  const panelOrbit = document.getElementById("panelOrbit");
  const panelDeck = document.getElementById("panelDeck");
  const panelRail = document.getElementById("panelRail");
  const panelWheel = document.getElementById("panelWheel");
  panelOrbit?.classList.toggle("is-active", concept === "orbit");
  panelDeck?.classList.toggle("is-active", concept === "deck");
  panelRail?.classList.toggle("is-active", concept === "rail");
  panelWheel?.classList.toggle("is-active", concept === "wheel");
  panelOrbit?.toggleAttribute("hidden", concept !== "orbit");
  panelDeck?.toggleAttribute("hidden", concept !== "deck");
  panelRail?.toggleAttribute("hidden", concept !== "rail");
  panelWheel?.toggleAttribute("hidden", concept !== "wheel");
  document.body.dataset.dashLabConcept = concept;

  if (!options.skipUrl) {
    const url = new URL(window.location.href);
    if (concept === "orbit") url.searchParams.delete("concept");
    else url.searchParams.set("concept", concept);
    window.history.replaceState({}, "", url.pathname + url.search);
  }
}

function buildIntelRail() {
  const nav = document.getElementById("intelRail");
  if (!nav || nav.dataset.built) return;
  nav.dataset.built = "1";

  const parts = RAIL_SECTIONS.map((section, i) => {
    const btn = `<button type="button" class="intel-rail__item${section.id === activeRailId ? " is-active" : ""}" data-rail-id="${section.id}" role="tab" aria-selected="${section.id === activeRailId}">${section.label}</button>`;
    const sep = i < RAIL_SECTIONS.length - 1 ? `<span class="intel-rail__sep" aria-hidden="true">•</span>` : "";
    return btn + sep;
  }).join("");

  nav.innerHTML = `<div class="intel-rail__track">${parts}</div>`;
  nav.querySelectorAll("[data-rail-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectRailSection(btn.dataset.railId));
  });
}

function selectRailSection(id) {
  activeRailId = id;
  const stage = document.getElementById("railModuleStage");
  if (!stage) return;

  document.querySelectorAll(".intel-rail__item").forEach((btn) => {
    const on = btn.dataset.railId === id;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    if (on) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });

  stage.classList.remove("is-visible");
  requestAnimationFrame(() => {
    stage.innerHTML = renderRailModule(id);
    stage.classList.add("is-visible");
  });
}

function initRail() {
  const hero = document.getElementById("railPulseHero");
  if (hero) hero.innerHTML = renderRailPulseHero();
  buildIntelRail();
  selectRailSection(activeRailId);
}

function selectWheelModule(id) {
  activeWheelId = id;
  const stage = document.getElementById("wheelModuleStage");
  if (!stage) return;
  stage.classList.remove("is-visible");
  requestAnimationFrame(() => {
    stage.innerHTML = renderRailModule(id);
    stage.classList.add("is-visible");
  });
}

function initWheel() {
  const viewport = document.getElementById("wheelViewport");
  if (!viewport || viewport.dataset.built) return;
  viewport.dataset.built = "1";

  wheelController = createIntelligenceWheel(viewport, WHEEL_SECTIONS, {
    initialId: activeWheelId,
    onActiveChange: (id) => selectWheelModule(id),
  });
  selectWheelModule(activeWheelId);
}

function getConceptFromUrl() {
  const c = new URLSearchParams(window.location.search).get("concept");
  if (c === "orbit" || c === "deck" || c === "rail" || c === "wheel") return c;
  return null;
}

function bindConceptToggle() {
  document.querySelectorAll("[data-concept]").forEach((btn) => {
    btn.addEventListener("click", () => setConcept(btn.dataset.concept));
  });
}

function fillRiver() {
  const el = document.getElementById("dashLabRiver");
  if (!el) return;
  const fallback =
    "SPY +0.48% · QQQ +0.62% · NVDA −1.24% · VIX 14.2 · AAPL +0.82% · BRIEFTICK · DASHBOARD LAB · ";
  el.textContent = fallback.repeat(6);
}

function init() {
  window.__DASHBOARD_DESIGN_LAB = true;
  document.documentElement.setAttribute("data-theme", "split");

  bindConceptToggle();
  buildOrbitStage();
  selectOrbitNode("flows");
  renderDeckTabs();
  selectDeckCard(0);
  initRail();
  initWheel();
  fillRiver();

  const urlConcept = getConceptFromUrl();
  setConcept(urlConcept || "orbit", { skipUrl: Boolean(urlConcept) });

  document.getElementById("deckPrev")?.addEventListener("click", () => {
    selectDeckCard((activeDeckIndex - 1 + DECK_CARDS.length) % DECK_CARDS.length);
  });
  document.getElementById("deckNext")?.addEventListener("click", () => {
    selectDeckCard((activeDeckIndex + 1) % DECK_CARDS.length);
  });

  let touchX = 0;
  const deckViewport = document.getElementById("deckViewport");
  deckViewport?.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  deckViewport?.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].screenX - touchX;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) selectDeckCard((activeDeckIndex + 1) % DECK_CARDS.length);
      else selectDeckCard((activeDeckIndex - 1 + DECK_CARDS.length) % DECK_CARDS.length);
    },
    { passive: true }
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
