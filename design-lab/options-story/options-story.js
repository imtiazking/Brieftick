import {
  OPTIONS_STORY,
  UNUSUAL_ROWS,
  CHAIN_PLACEHOLDER,
  HEATMAP_PLACEHOLDER,
  DARKPOOL_PLACEHOLDER,
} from "./options-story-data.js";

const state = {
  tab: "unusual",
  filterTag: null,
  search: "",
  flowSelectedId: null,
  flowExpandedId: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowMatchesFilter(row) {
  if (!state.filterTag) return true;
  return row.tags?.includes(state.filterTag);
}

function rowMatchesSearch(row) {
  if (!state.search.trim()) return true;
  const q = state.search.toLowerCase();
  const hay = [row.sym, row.type, row.sentiment, row.strike]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function rowMatchesToolbar(row) {
  const type = $("#osTypeFilter")?.value || "";
  const sent = $("#osSentFilter")?.value || "";
  if (type && row.type !== type) return false;
  if (sent && row.sentiment !== sent) return false;
  return true;
}

function renderUnusualTable() {
  const tbody = $("#osTableBody");
  if (!tbody) return;
  const hasFilter = !!state.filterTag;
  const searchable = UNUSUAL_ROWS.filter(
    (r) => rowMatchesSearch(r) && rowMatchesToolbar(r)
  );

  if (!searchable.length) {
    tbody.innerHTML =
      '<tr><td colspan="12" style="text-align:center;color:var(--ink-faint);padding:24px">No rows match your search.</td></tr>';
    return;
  }

  tbody.innerHTML = UNUSUAL_ROWS.map((r) => {
    const visible =
      rowMatchesSearch(r) &&
      rowMatchesToolbar(r) &&
      (!hasFilter || rowMatchesFilter(r));
    const highlight = hasFilter && rowMatchesFilter(r);
    const cls = [
      !visible && hasFilter ? "os-row-dimmed" : "",
      highlight ? "os-row-highlight" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const sentCls =
      r.sentiment === "bullish" ? "buy" : r.sentiment === "bearish" ? "sell" : "mixed";
    return `<tr data-id="${r.id}" class="${cls}">
      <td>${escapeHtml(r.time)}</td>
      <td class="sym">${escapeHtml(r.sym)}</td>
      <td><span class="os-action ${sentCls === "buy" ? "call" : "put"}">${escapeHtml(r.type)}</span></td>
      <td>${escapeHtml(r.strike)}</td>
      <td>${escapeHtml(r.expiry)}</td>
      <td>${escapeHtml(r.premium)}</td>
      <td>${escapeHtml(r.volume)}</td>
      <td>${escapeHtml(r.oi)}</td>
      <td>${escapeHtml(r.volOi)}</td>
      <td>${escapeHtml(r.iv)}</td>
      <td>${escapeHtml(r.spot)}</td>
      <td><span class="os-sent os-sent--${sentCls}">${escapeHtml(r.sentiment)}</span></td>
    </tr>`;
  }).join("");
}

function renderPlaceholderPanel(text) {
  const panel = $("#osTabPanel");
  if (panel) {
    panel.innerHTML = `<p class="os-placeholder">${escapeHtml(text)}</p>`;
  }
}

function renderTable() {
  if (state.tab === "unusual") renderUnusualTable();
  else if (state.tab === "chain") renderPlaceholderPanel(CHAIN_PLACEHOLDER);
  else if (state.tab === "heatmap") renderPlaceholderPanel(HEATMAP_PLACEHOLDER);
  else renderPlaceholderPanel(DARKPOOL_PLACEHOLDER);
  updateFilterHint();
}

function updateFilterHint() {
  const hint = $("#osFilterHint");
  if (!hint) return;
  if (!state.filterTag) {
    hint.textContent = "";
    hint.classList.remove("visible");
    return;
  }
  hint.classList.add("visible");
  hint.textContent = "Filtered view — select another flow card to change";
}

function setTab(tab) {
  state.tab = tab;
  $$(".os-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  const toolbar = $("#osToolbar");
  if (toolbar) toolbar.hidden = tab !== "unusual";
  renderTable();
}

function syncFlowCards() {
  const flow = OPTIONS_STORY.flows.find((f) => f.id === state.flowSelectedId);
  $$(".os-flow-card").forEach((card) => {
    card.classList.toggle("active", flow && card.dataset.flowId === flow.id);
  });
}

function applyFlowFilter({ filterTag, tab, scroll = false }) {
  if (tab) setTab(tab);
  state.filterTag = filterTag || null;
  syncFlowCards();
  renderTable();
  if (scroll) scrollToData();
}

function clearFlowFilter({ scroll = false } = {}) {
  state.filterTag = null;
  state.flowSelectedId = null;
  state.flowExpandedId = null;
  $$(".os-flow-unit").forEach((u) => u.classList.remove("is-selected", "is-expanded"));
  $$(".os-flow-explore-panel").forEach((p) => {
    p.hidden = true;
  });
  syncFlowCards();
  renderTable();
  if (scroll) scrollToData();
}

function selectFlowUnit(flowId) {
  state.flowSelectedId = flowId;
  $$(".os-flow-unit").forEach((u) => {
    u.classList.toggle("is-selected", u.dataset.flowId === flowId);
  });
}

function scrollToData() {
  $("#osDataSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function mountStory() {
  const root = $("#optionsStoryMount");
  if (!root || root.dataset.mounted === "2") return;
  root.dataset.mounted = "2";

  const story = OPTIONS_STORY.todayStory;
  const pos = OPTIONS_STORY.overallPositioning;
  const tickers = (names) =>
    names.map((n) => `<span class="os-flow-preview__ticker">${escapeHtml(n)}</span>`).join("");

  const flowUnitsHtml = OPTIONS_STORY.flows
    .map(
      (flow) => `
    <div class="os-flow-unit" data-flow-id="${escapeHtml(flow.id)}">
      <div class="os-flow-unit__card">
        <button type="button" class="os-flow-card" data-flow-id="${escapeHtml(flow.id)}" data-tone="${escapeHtml(flow.tone)}">
          <span class="os-flow-card__label">${escapeHtml(flow.label)}</span>
          <span class="os-flow-card__headline">${escapeHtml(flow.headline)}</span>
        </button>
        <div class="os-flow-preview" aria-hidden="true">
          <div class="os-flow-preview__row">
            <span class="os-flow-preview__label">Key names</span>
            <div class="os-flow-preview__tickers">${tickers(flow.keyNames)}</div>
          </div>
          <p class="os-flow-preview__why"><strong>Why:</strong> ${escapeHtml(flow.why)}</p>
          <p class="os-flow-preview__matters"><strong>Why it matters:</strong> ${escapeHtml(flow.whyItMatters)}</p>
          <button type="button" class="os-flow-explore-btn" data-flow-id="${escapeHtml(flow.id)}">Explore Flow →</button>
        </div>
      </div>
      <div class="os-flow-explore-panel" id="explore-${escapeHtml(flow.id)}" hidden>
        <div class="os-flow-explore-panel__inner">
          <p class="os-flow-explore-body">${escapeHtml(flow.explore.explanation)}</p>
          <div class="os-flow-explore-actions">
            <button type="button" class="os-flow-view-table" data-flow-id="${escapeHtml(flow.id)}">View activity in table →</button>
            <button type="button" class="os-flow-explore-close" data-flow-id="${escapeHtml(flow.id)}">Close</button>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  root.innerHTML = `
    <section class="os-today-story" aria-labelledby="osTodayEyebrow">
      <p class="os-today-story__eyebrow" id="osTodayEyebrow">${escapeHtml(story.eyebrow)}</p>
      <p class="os-today-story__body">${escapeHtml(story.body)}</p>
    </section>
    <aside class="os-positioning" aria-label="Overall positioning">
      <h3 class="os-positioning__title">${escapeHtml(pos.title)}</h3>
      <p class="os-positioning__label">${escapeHtml(pos.label)}</p>
      <p class="os-positioning__why">${escapeHtml(pos.why)}</p>
    </aside>
    <div class="os-flows-grid">${flowUnitsHtml}</div>
    <button type="button" class="os-view-activity" id="osViewActivity">
      View activity
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  OPTIONS_STORY.flows.forEach((flow) => {
    const unit = $(`.os-flow-unit[data-flow-id="${flow.id}"]`, root);
    const card = $(".os-flow-card", unit);
    const exploreBtn = $(".os-flow-explore-btn", unit);
    const explorePanel = $(`#explore-${flow.id}`, root);
    const closeBtn = $(".os-flow-explore-close", unit);
    const viewTableBtn = $(".os-flow-view-table", unit);

    card?.addEventListener("click", () => {
      selectFlowUnit(flow.id);
      applyFlowFilter({ filterTag: flow.filterTag, tab: flow.tab, scroll: false });
    });

    exploreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.flowExpandedId === flow.id) {
        explorePanel.hidden = true;
        unit.classList.remove("is-expanded");
        state.flowExpandedId = null;
        return;
      }
      $$(".os-flow-explore-panel", root).forEach((p) => {
        p.hidden = true;
      });
      $$(".os-flow-unit", root).forEach((u) => u.classList.remove("is-expanded"));
      state.flowExpandedId = flow.id;
      unit.classList.add("is-expanded");
      explorePanel.hidden = false;
      selectFlowUnit(flow.id);
      applyFlowFilter({ filterTag: flow.filterTag, tab: flow.tab, scroll: false });
      requestAnimationFrame(() => {
        explorePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });

    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      explorePanel.hidden = true;
      unit.classList.remove("is-expanded");
      state.flowExpandedId = null;
    });

    viewTableBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      applyFlowFilter({ filterTag: flow.filterTag, tab: flow.tab, scroll: true });
    });
  });

  $("#osViewActivity", root)?.addEventListener("click", () => {
    scrollToData();
  });
}

function bindEvents() {
  $$(".os-tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  $("#osSearch")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    renderTable();
  });

  $("#osTypeFilter")?.addEventListener("change", () => renderTable());
  $("#osSentFilter")?.addEventListener("change", () => renderTable());
}

function init() {
  mountStory();
  bindEvents();
  setTab("unusual");
  renderTable();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
