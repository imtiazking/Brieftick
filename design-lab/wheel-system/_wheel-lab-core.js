/**
 * Wheel System Lab — vertical wheel + intelligence panel
 * @module design-lab/wheel-system/_wheel-lab-core
 */

import { createVerticalIntelligenceWheel } from "/design-lab/wheel-system/_wheel-vertical-wheel.js";

const PANEL_SHELL = `
  <article class="intel-panel" id="wheelIntelPanel">
    <header class="intel-panel__head">
      <span class="intel-panel__badge" id="wheelLayerBadge">—</span>
      <h2 class="intel-panel__headline" id="wheelHeadline">—</h2>
    </header>
    <p class="intel-panel__explanation" id="wheelExplanation">—</p>
    <section class="intel-panel__block" aria-labelledby="wheelWhyLabel">
      <h3 class="intel-panel__label" id="wheelWhyLabel">Why it matters</h3>
      <p class="intel-panel__copy" id="wheelWhy">—</p>
    </section>
    <div class="intel-panel__cards" id="wheelDataCards"></div>
    <section class="intel-panel__block" aria-labelledby="wheelStocksLabel">
      <h3 class="intel-panel__label" id="wheelStocksLabel">Stocks affected</h3>
      <div class="intel-panel__stocks" id="wheelStocks"></div>
    </section>
    <section class="intel-panel__block" aria-labelledby="wheelWatchLabel">
      <h3 class="intel-panel__label" id="wheelWatchLabel">Watch next</h3>
      <ul class="intel-panel__watch" id="wheelWatch"></ul>
    </section>
  </article>`;

/** Flagship FORGENIQ Briefing panel */
const FLAGSHIP_PANEL_SHELL = `
  <article class="briefing-panel" id="wheelIntelPanel">
    <header class="briefing-panel__hero">
      <span class="briefing-panel__segment" id="wheelLayerBadge">Today</span>
      <h1 class="briefing-panel__headline" id="wheelHeadline">—</h1>
    </header>
    <section class="briefing-panel__section" data-whm-section="happened" aria-labelledby="wheelHappenedLabel">
      <h2 class="briefing-panel__label" id="wheelHappenedLabel">What happened</h2>
      <p class="briefing-panel__body" id="wheelExplanation">—</p>
    </section>
    <section class="briefing-panel__section" data-whm-section="why" aria-labelledby="wheelWhyLabel">
      <h2 class="briefing-panel__label" id="wheelWhyLabel">Why it matters</h2>
      <p class="briefing-panel__body" id="wheelWhy">—</p>
    </section>
    <div class="briefing-panel__cards" id="wheelDataCards" data-whm-section="sectors"></div>
    <section class="briefing-panel__section" data-whm-section="stocks" aria-labelledby="wheelStocksLabel">
      <h2 class="briefing-panel__label" id="wheelStocksLabel">Stocks affected</h2>
      <div class="briefing-panel__stocks" id="wheelStocks"></div>
    </section>
    <section class="briefing-panel__section" data-whm-section="watch" aria-labelledby="wheelWatchLabel">
      <h2 class="briefing-panel__label" id="wheelWatchLabel">Watch next</h2>
      <ul class="briefing-panel__watch" id="wheelWatch"></ul>
    </section>
  </article>`;

const LABELS_ARCHIVE = {
  sectors: "Sectors affected",
  stocks: "Stocks affected",
  reaction: "Market reaction",
  watch: "Watch next",
};

const LABELS_FLAGSHIP = {
  happened: "What happened",
  why: "Why it matters",
  sectors: "Sectors affected",
  stocks: "Stocks affected",
  reaction: "Market reaction",
  watch: "Watch next",
};

/**
 * @param {object} config
 * @param {{ configKey?: string }} [meta]
 */
export function initWheelLab(config, meta = {}) {
  const run = () => bootWheelLab(config, meta);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(run));
  }
}

function bootWheelLab(config, meta = {}) {
  const route = window.location.pathname;
  const configKey = meta.configKey || config?.id || "unknown";
  const sections = Array.isArray(config?.sections) ? config.sections : [];
  const isFlagship = Boolean(config.flagship);
  const isBriefingRail = config.layout === "briefingRail";
  const isProduction = Boolean(meta.production);
  const panelLabels = isFlagship ? LABELS_FLAGSHIP : LABELS_ARCHIVE;
  let wheelInitOk = false;
  let wheelInitError = "";

  if (!isProduction) {
    document.title = isFlagship
      ? `${config.title} · Design Lab · FORGENIQ`
      : `${config.title} · Wheel System · FORGENIQ`;
  } else {
    document.title = `What's Moving · FORGENIQ`;
  }

  const titleEl = document.getElementById("wheelLabTitle");
  if (titleEl) {
    titleEl.textContent = isFlagship ? config.title : `Wheel System · ${config.title}`;
  }

  const chromeLink = document.querySelector(".wheel-lab-chrome a");
  if (chromeLink && isFlagship && !isProduction) {
    chromeLink.textContent = "← Design lab";
    chromeLink.href = "/design-lab/wheel-system";
  }

  const pulseStrip =
    meta.pulseStripEl || document.getElementById("wheelPulseStrip");
  if (pulseStrip) {
    pulseStrip.innerHTML = `
      <span class="wheel-pulse-strip__tag">${esc(config.pulseTag)}</span>
      <p class="wheel-pulse-strip__headline">${esc(config.pulseHeadline)}</p>`;
  }

  const subtitle = meta.subtitleEl || document.getElementById("wheelLabSubtitle");
  if (subtitle) {
    if (isProduction) {
      subtitle.textContent = config.subtitle || "Today's market briefing";
    } else {
      subtitle.textContent = isFlagship
        ? "Spin the wheel for each layer of today's briefing"
        : isBriefingRail
          ? "Select a briefing layer · drag or click"
          : `${config.subtitle} · Drag or click a segment · arrow keys`;
    }
  }

  const engine = meta.engineEl || document.getElementById("wheelEngine");
  const viewport = meta.viewportEl || document.getElementById("wheelViewport");
  if (!engine || !viewport) {
    wheelInitError = meta.production
      ? "Missing What's Moving wheel mount (#whmWheelViewport / #whmWheelEngine)"
      : "Missing #wheelEngine or #wheelViewport";
    console.error("[wheel-lab]", wheelInitError);
    if (!isFlagship) mountDebugPanel({ route, configKey, sections, wheelInitOk, wheelInitError });
    return;
  }

  if (!sections.length) {
    wheelInitError = "config.sections is empty";
    console.error("[wheel-lab]", wheelInitError, configKey);
    if (!isFlagship) mountDebugPanel({ route, configKey, sections, wheelInitOk, wheelInitError });
    return;
  }

  engine.innerHTML = isFlagship ? FLAGSHIP_PANEL_SHELL : isBriefingRail ? PANEL_SHELL : PANEL_SHELL;

  if (!isProduction) mountDivePanel();
  let activeSegment = sections[0].id;
  let diveContext = "";

  function isWhmMobileSlim() {
    return (
      isFlagship &&
      isProduction &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches
    );
  }

  function syncWhmMobileChrome(segmentId) {
    if (!isFlagship || !isProduction) return;
    const page = document.getElementById("page-why");
    const panel = document.getElementById("wheelIntelPanel");
    const snapWrap = document.getElementById("whmSnapshotWrap");
    if (page) page.dataset.whmSegment = segmentId;
    if (panel) panel.dataset.whmSegment = segmentId;
    if (snapWrap) {
      snapWrap.classList.toggle("is-today-segment", segmentId === "today");
      if (segmentId !== "today") snapWrap.removeAttribute("open");
      else if (window.matchMedia("(min-width: 769px)").matches) snapWrap.setAttribute("open", "");
    }
  }

  function syncSnapshotDesktopOpen() {
    const snapWrap = document.getElementById("whmSnapshotWrap");
    if (!snapWrap) return;
    if (window.matchMedia("(min-width: 769px)").matches) {
      snapWrap.setAttribute("open", "");
    }
  }

  function renderDataCards(layer, segmentId) {
    const root = document.getElementById("wheelDataCards");
    if (!root) return;
    const sectors = layer.sectors || [];
    const cardClass = isFlagship ? "briefing-data-card" : "intel-data-card";
    const gridClass = isFlagship ? "briefing-data-card__grid" : "intel-data-card__grid";
    const slim = isWhmMobileSlim();
    const showSectors = !slim || ["today", "winners", "losers"].includes(segmentId);
    const showReaction = !slim || segmentId === "today";

    const sectorCards = sectors
      .map(
        (s) => `
      <div class="${cardClass}">
        <span class="${cardClass}__kicker">Sector</span>
        <strong class="${cardClass}__title">${esc(s.name)}</strong>
        <span class="${cardClass}__move is-${esc(s.tone || "up")}">${esc(s.move)}</span>
      </div>`
      )
      .join("");

    const blockClass = isFlagship ? "briefing-panel__section" : "intel-panel__block";
    const labelClass = isFlagship ? "briefing-panel__label" : "intel-panel__label";

    const sectorsBlock = showSectors
      ? `
      <section class="${blockClass}" data-whm-section="sectors" aria-labelledby="wheelSectorsLabel">
        <h2 class="${labelClass}" id="wheelSectorsLabel">${esc(panelLabels.sectors)}</h2>
        <div class="${gridClass}">${sectorCards}</div>
      </section>`
      : "";

    const reactionBlock = showReaction
      ? `
      <section class="${blockClass}" data-whm-section="reaction" aria-labelledby="wheelReactionLabel">
        <h2 class="${labelClass}" id="wheelReactionLabel">${esc(panelLabels.reaction)}</h2>
        <div class="${cardClass} ${cardClass}--wide">
          <span class="${cardClass}__kicker">Session tape</span>
          <p class="${cardClass}__copy">${esc(layer.reaction || "—")}</p>
        </div>
      </section>`
      : "";

    root.innerHTML = sectorsBlock + reactionBlock;
  }

  function renderStocks(stocks) {
    const stocksEl = document.getElementById("wheelStocks");
    const stocksLabel = document.getElementById("wheelStocksLabel");
    if (stocksLabel) stocksLabel.textContent = panelLabels.stocks;
    if (!stocksEl) return;
    const btnClass = isFlagship ? "briefing-stock" : "intel-stock";
    stocksEl.innerHTML = (stocks || [])
      .map((s) => {
        const cls = String(s.pct).startsWith("−") || String(s.pct).startsWith("-") ? "dn" : "up";
        return `<button type="button" class="${btnClass}" data-sym="${esc(s.sym)}" data-name="${esc(s.name)}">
          <span class="${btnClass}__sym">${esc(s.sym)}</span>
          <span class="${btnClass}__name">${esc(s.name)}</span>
          <span class="${btnClass}__role">${esc(s.role)}</span>
          <span class="${btnClass}__pct is-${cls}">${esc(s.pct)}</span>
        </button>`;
      })
      .join("");
    stocksEl.querySelectorAll(`.${btnClass}`).forEach((btn) => {
      btn.addEventListener("click", () => openDive(btn.dataset.sym, btn.dataset.name));
    });
  }

  function renderWatch(watchNext) {
    const watchEl = document.getElementById("wheelWatch");
    const watchLabel = document.getElementById("wheelWatchLabel");
    if (watchLabel) watchLabel.textContent = panelLabels.watch;
    if (!watchEl) return;
    const items = Array.isArray(watchNext) ? watchNext : [watchNext].filter(Boolean);
    watchEl.innerHTML = items.map((w) => `<li>${esc(w)}</li>`).join("") || "<li>—</li>";
  }

  function applyLayer(segmentId) {
    const layer = config.layers?.[segmentId];
    if (!layer) return;
    activeSegment = segmentId;
    diveContext = layer.dive || layer.layer;

    engine.classList.add("is-swapping");
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const badge = document.getElementById("wheelLayerBadge");
          const headline = document.getElementById("wheelHeadline");
          const explanation = document.getElementById("wheelExplanation");
          const why = document.getElementById("wheelWhy");
          if (badge) badge.textContent = layer.layer;
          if (headline) headline.textContent = layer.headline || "—";
          if (explanation) explanation.textContent = layer.explanation || "—";
          if (why) why.textContent = layer.whyItMatters || "—";
          syncWhmMobileChrome(segmentId);
          renderDataCards(layer, segmentId);
          renderStocks(layer.stocks);
          renderWatch(layer.watchNext);
        } catch (err) {
          console.error("[wheel-lab] applyLayer failed:", err);
        } finally {
          engine.classList.remove("is-swapping");
        }
      }, 160);
    });
  }

  function openDive(sym, name) {
    if (isProduction && typeof window.openTickerDeepDive === "function") {
      window.openTickerDeepDive({
        symbol: sym,
        source: "movers",
        tab: "overview",
      });
      return;
    }
    const el = document.getElementById("wheelDive");
    if (!el) return;
    document.getElementById("diveSym").textContent = sym;
    document.getElementById("diveName").textContent = name;
    document.getElementById("diveCtx").textContent =
      `${diveContext} · ${config.title} · “${activeSegment}” · Mock Deep Dive (design lab).`;
    el.classList.add("is-open");
  }

  try {
    createVerticalIntelligenceWheel(viewport, sections, {
      initialId: sections[0].id,
      onActiveChange: (id) => applyLayer(id),
    });
    wheelInitOk = viewport.querySelectorAll(".intel-wheel__chip").length === sections.length;
    if (!wheelInitOk) {
      wheelInitError = `Expected ${sections.length} chips, found ${viewport.querySelectorAll(".intel-wheel__chip").length}`;
    }
  } catch (err) {
    wheelInitOk = false;
    wheelInitError = err instanceof Error ? err.message : String(err);
    console.error("[wheel-lab] createVerticalIntelligenceWheel failed:", err);
  }

  applyLayer(sections[0].id);
  if (isFlagship && isProduction) {
    syncSnapshotDesktopOpen();
    window.addEventListener(
      "resize",
      () => {
        syncSnapshotDesktopOpen();
        applyLayer(activeSegment);
      },
      { passive: true }
    );
  }
  if (!isFlagship) mountDebugPanel({ route, configKey, sections, wheelInitOk, wheelInitError });
}

function mountDebugPanel({ route, configKey, sections, wheelInitOk, wheelInitError }) {
  let el = document.getElementById("wheelLabDebug");
  if (!el) {
    el = document.createElement("aside");
    el.id = "wheelLabDebug";
    el.className = "wheel-lab-debug";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  const labels = sections.map((s) => s.label).join(", ") || "(none)";
  el.innerHTML = `
    <strong>Wheel lab debug</strong>
    <dl>
      <dt>Route</dt><dd>${esc(route)}</dd>
      <dt>Config</dt><dd>${esc(configKey)}</dd>
      <dt>Segments</dt><dd>${sections.length} — ${esc(labels)}</dd>
      <dt>Vertical wheel</dt><dd class="${wheelInitOk ? "ok" : "err"}">${wheelInitOk ? "OK" : esc(wheelInitError || "failed")}</dd>
    </dl>`;
}

function mountDivePanel() {
  if (document.getElementById("wheelDive")) return;
  const aside = document.createElement("aside");
  aside.className = "wheel-dive";
  aside.id = "wheelDive";
  aside.innerHTML = `
    <div class="wheel-dive__bg" id="wheelDiveBg"></div>
    <div class="wheel-dive__panel">
      <button type="button" class="wheel-dive__close" id="wheelDiveClose" aria-label="Close">×</button>
      <p class="kicker">Deep Dive · Mock</p>
      <h3 id="diveSym">NVDA</h3>
      <p id="diveName">NVIDIA</p>
      <p id="diveCtx" style="margin-top:16px"></p>
    </div>`;
  document.body.appendChild(aside);
  const close = () => document.getElementById("wheelDive").classList.remove("is-open");
  document.getElementById("wheelDiveClose").addEventListener("click", close);
  document.getElementById("wheelDiveBg").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
