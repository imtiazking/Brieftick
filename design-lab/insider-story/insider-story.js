import {
  CORPORATE_ROWS,
  POLITICAL_ROWS,
  CLUSTER_ROWS,
  CONCEPT_A,
  CONCEPT_B,
  CONCEPT_C,
} from "./insider-story-data.js";

const state = {
  concept: "a",
  tab: "corporate",
  filterTag: null,
  highlightRowId: null,
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

function rowMatchesFilter(row, tab) {
  if (!state.filterTag && !state.highlightRowId) return true;
  if (state.highlightRowId && row.id === state.highlightRowId) return true;
  if (state.filterTag && row.tags?.includes(state.filterTag)) return true;
  if (state.filterTag && tab === "corporate") {
    if (state.filterTag === "most-sold" && row.action === "sell") return true;
    if (state.filterTag === "most-bought" && row.action === "buy") return true;
  }
  return false;
}

function rowMatchesSearch(row, tab) {
  if (!state.search.trim()) return true;
  const q = state.search.toLowerCase();
  const hay = [
    row.sym,
    row.company,
    row.person,
    row.title,
    row.sector,
    row.cluster,
    row.chamber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function renderCorporateTable() {
  const tbody = $("#isTableBody");
  if (!tbody) return;
  const hasFilter = state.filterTag || state.highlightRowId;
  const searchable = CORPORATE_ROWS.filter((r) => rowMatchesSearch(r, "corporate"));

  if (!searchable.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:24px">No rows match your search.</td></tr>';
    return;
  }

  tbody.innerHTML = CORPORATE_ROWS.map((r) => {
    const visible =
      rowMatchesSearch(r, "corporate") &&
      (!hasFilter || rowMatchesFilter(r, "corporate"));
    const highlight =
      (state.highlightRowId && r.id === state.highlightRowId) ||
      (state.filterTag && rowMatchesFilter(r, "corporate"));
    const cls = [
      !visible && hasFilter ? "is-dimmed" : "",
      highlight && hasFilter ? "is-highlight" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const actionCls = r.action === "buy" ? "buy" : "sell";
    return `<tr data-id="${r.id}" class="${cls}" ${!visible && hasFilter ? 'aria-hidden="true"' : ""}>
      <td>${escapeHtml(r.date)}</td>
      <td class="sym">${escapeHtml(r.sym)}</td>
      <td>${escapeHtml(r.company)}</td>
      <td>${escapeHtml(r.person)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td><span class="is-action ${actionCls}">${escapeHtml(r.action)}</span></td>
      <td>${escapeHtml(r.shares)}</td>
      <td>${escapeHtml(r.value)}</td>
      <td>${escapeHtml(r.sector)}</td>
    </tr>`;
  }).join("");
}

function renderPoliticalTable() {
  const tbody = $("#isTableBody");
  if (!tbody) return;
  const hasFilter = state.filterTag || state.highlightRowId;
  const searchable = POLITICAL_ROWS.filter((r) => rowMatchesSearch(r, "politics"));

  if (!searchable.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:24px">No rows match your search.</td></tr>';
    return;
  }

  tbody.innerHTML = POLITICAL_ROWS.map((r) => {
    const visible =
      rowMatchesSearch(r, "politics") &&
      (!hasFilter || rowMatchesFilter(r, "politics"));
    const highlight = state.filterTag && rowMatchesFilter(r, "politics");
    const cls = [
      !visible && hasFilter ? "is-dimmed" : "",
      highlight && hasFilter ? "is-highlight" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const actionCls = r.action === "buy" ? "buy" : "sell";
    return `<tr data-id="${r.id}" class="${cls}">
      <td>${escapeHtml(r.date)}</td>
      <td class="sym">${escapeHtml(r.sym)}</td>
      <td>${escapeHtml(r.company)}</td>
      <td>${escapeHtml(r.person)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td><span class="is-action ${actionCls}">${escapeHtml(r.action)}</span></td>
      <td>${escapeHtml(r.shares)}</td>
      <td>${escapeHtml(r.value)}</td>
      <td>${escapeHtml(r.sector)}</td>
    </tr>`;
  }).join("");
}

function renderClusterTable() {
  const tbody = $("#isTableBody");
  if (!tbody) return;
  const hasFilter = state.filterTag || state.highlightRowId;

  tbody.innerHTML = CLUSTER_ROWS.map((r) => {
    const visible =
      rowMatchesSearch(r, "clusters") &&
      (!hasFilter || rowMatchesFilter(r, "clusters"));
    const highlight = state.filterTag && rowMatchesFilter(r, "clusters");
    const cls = [
      !visible && hasFilter ? "is-dimmed" : "",
      highlight && hasFilter ? "is-highlight" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const actionCls =
      r.direction === "buy" ? "buy" : r.direction === "sell" ? "sell" : "mixed";
    return `<tr data-id="${r.id}" class="${cls}">
      <td>${escapeHtml(r.date)}</td>
      <td class="sym">${escapeHtml(r.sym)}</td>
      <td>${escapeHtml(r.company)}</td>
      <td>${escapeHtml(r.cluster)}</td>
      <td>${r.filings} filings</td>
      <td><span class="is-action ${actionCls}">${escapeHtml(r.direction)}</span></td>
      <td colspan="3">${escapeHtml(r.summary)}</td>
    </tr>`;
  }).join("");
}

function updateTableHead() {
  const head = $("#isTableHead");
  if (!head) return;
  if (state.tab === "clusters") {
    head.innerHTML = `<tr>
      <th>Date</th><th>Ticker</th><th>Company</th><th>Cluster</th>
      <th>Activity</th><th>Direction</th><th colspan="3">Summary</th>
    </tr>`;
  } else {
    head.innerHTML = `<tr>
      <th>Date</th><th>Ticker</th><th>Company</th><th>${state.tab === "politics" ? "Lawmaker" : "Insider"}</th>
      <th>Role</th><th>Action</th><th>Shares</th><th>Value</th><th>Sector</th>
    </tr>`;
  }
}

function renderTable() {
  updateTableHead();
  if (state.tab === "corporate") renderCorporateTable();
  else if (state.tab === "politics") renderPoliticalTable();
  else renderClusterTable();
  updateFilterHint();
}

function updateFilterHint() {
  const hint = $("#isFilterHint");
  if (!hint) return;
  if (!state.filterTag && !state.highlightRowId) {
    hint.textContent = "";
    hint.classList.remove("visible");
    return;
  }
  hint.classList.add("visible");
  hint.textContent = "Filtered view — click another card or clear search to reset";
}

function setTab(tab) {
  state.tab = tab;
  $$(".is-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderTable();
}

function applyCardFilter({ tab, filterTag, rowId, scroll = true }) {
  if (tab) setTab(tab);
  state.filterTag = filterTag || null;
  state.highlightRowId = rowId || null;
  syncCardActiveStates(filterTag, rowId);
  renderTable();
  if (scroll) scrollToData();
}

function syncCardActiveStates(filterTag, rowId) {
  $$(".is-key-card, .is-flow-card, .is-spot-card, .is-notable-chip").forEach((el) => {
    const match =
      (filterTag && el.dataset.filter === filterTag) ||
      (rowId && el.dataset.row === rowId);
    el.classList.toggle("active", !!match);
  });
}

function clearCardActive() {
  $$(".is-key-card, .is-flow-card, .is-spot-card, .is-notable-chip").forEach((el) =>
    el.classList.remove("active")
  );
  $$(".is-flow-unit").forEach((u) => {
    u.classList.remove("is-selected", "is-expanded");
  });
  state.flowSelectedId = null;
  state.flowExpandedId = null;
}

function selectFlowUnit(flowId) {
  state.flowSelectedId = flowId;
  $$(".is-flow-unit").forEach((u) => {
    u.classList.toggle("is-selected", u.dataset.flowId === flowId);
  });
}

function scrollToData() {
  const section = $("#isDataSection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setConcept(id) {
  state.concept = id;
  document.body.classList.toggle("is-concept-b-active", id === "b");
  $$(".is-concept-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.concept === id);
  });
  $$(".is-concept-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.concept === id);
  });
}

function mountConceptA() {
  const panel = $("#conceptPanelA");
  if (!panel || panel.dataset.mounted) return;
  panel.dataset.mounted = "1";

  panel.innerHTML = `
    <div class="is-story-panel">
      <div class="story-eyebrow">${escapeHtml(CONCEPT_A.eyebrow)}</div>
      <h2>${escapeHtml(CONCEPT_A.title)}</h2>
      <p class="story-body">${escapeHtml(CONCEPT_A.body)}</p>
    </div>
    <div class="is-key-cards" id="isKeyCards"></div>
    <button type="button" class="is-view-activity" id="isViewActivityA">
      View Activity
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  const cardsEl = $("#isKeyCards", panel);
  CONCEPT_A.keyCards.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "is-key-card";
    btn.dataset.filter = card.filterTag;
    btn.innerHTML = `
      <div class="kc-label">${escapeHtml(card.label)}</div>
      <div class="kc-value">${escapeHtml(card.value)}</div>
      <div class="kc-hint">${escapeHtml(card.hint)}</div>
    `;
    btn.addEventListener("click", () =>
      applyCardFilter({ tab: card.tab, filterTag: card.filterTag })
    );
    cardsEl.appendChild(btn);
  });

  $("#isViewActivityA", panel)?.addEventListener("click", () => {
    state.filterTag = null;
    state.highlightRowId = null;
    clearCardActive();
    renderTable();
    scrollToData();
  });
}

function mountConceptB() {
  const panel = $("#conceptPanelB");
  if (!panel || panel.dataset.mounted === "4") return;
  panel.dataset.mounted = "4";

  const tickersInline = (names) =>
    names.map((n) => `<span class="is-flow-preview__ticker">${escapeHtml(n)}</span>`).join("");

  const flowUnitsHtml = CONCEPT_B.flows
    .map(
      (flow) => `
    <div class="is-flow-unit" data-flow-id="${escapeHtml(flow.id)}">
      <div class="is-flow-unit__card">
        <button type="button" class="is-flow-card" data-tone="${escapeHtml(flow.tone)}" data-filter="${escapeHtml(flow.filterTag)}">
          <div class="flow-label">${escapeHtml(flow.label)}</div>
          <div class="flow-sector">${escapeHtml(flow.sector)}</div>
        </button>
        <div class="is-flow-preview" aria-hidden="true">
          <div class="is-flow-preview__row">
            <span class="is-flow-preview__label">Key names</span>
            <div class="is-flow-preview__tickers">${tickersInline(flow.keyNames)}</div>
          </div>
          <p class="is-flow-preview__why"><strong>Why:</strong> ${escapeHtml(flow.why)}</p>
          <p class="is-flow-preview__matters"><strong>Why it matters:</strong> ${escapeHtml(flow.whyItMatters)}</p>
          <button type="button" class="is-flow-explore-btn" data-flow-id="${escapeHtml(flow.id)}">Explore Flow →</button>
        </div>
      </div>
      <div class="is-flow-explore-panel" id="explore-${escapeHtml(flow.id)}" hidden>
        <div class="is-flow-explore-panel__inner">
          <header class="is-flow-explore-head">
            <span class="is-flow-explore-eyebrow">Theme</span>
            <h3 class="is-flow-explore-theme">${escapeHtml(flow.explore.theme)}</h3>
          </header>
          <p class="is-flow-explore-names">${flow.keyNames.map((s) => escapeHtml(s)).join(" · ")}</p>
          <p class="is-flow-explore-body">${escapeHtml(flow.explore.explanation)}</p>
          <div class="is-flow-explore-actions">
            <button type="button" class="is-flow-view-table" data-flow-id="${escapeHtml(flow.id)}">View filings in table →</button>
            <button type="button" class="is-flow-explore-close" data-flow-id="${escapeHtml(flow.id)}">Close</button>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  const overall = CONCEPT_B.overallFlow || {};

  panel.innerHTML = `
    <h2 class="is-concept-b-title">${escapeHtml(CONCEPT_B.title)}</h2>
    <aside class="is-overall-flow" aria-label="Overall flow summary">
      <h3 class="is-overall-flow__title">${escapeHtml(overall.title || "Overall Flow")}</h3>
      <p class="is-overall-flow__body">${escapeHtml(overall.body || "")}</p>
    </aside>
    <div class="is-flows-grid" id="isFlows">${flowUnitsHtml}</div>
    <button type="button" class="is-view-activity" id="isViewActivityB">
      View filings
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  CONCEPT_B.flows.forEach((flow) => {
    const unit = $(`.is-flow-unit[data-flow-id="${flow.id}"]`, panel);
    const card = $(".is-flow-card", unit);
    const exploreBtn = $(".is-flow-explore-btn", unit);
    const explorePanel = $(`#explore-${flow.id}`, panel);
    const closeBtn = $(".is-flow-explore-close", unit);
    const viewTableBtn = $(".is-flow-view-table", unit);

    card?.addEventListener("click", () => {
      selectFlowUnit(flow.id);
      applyCardFilter({ tab: flow.tab, filterTag: flow.filterTag, scroll: false });
    });

    exploreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.flowExpandedId === flow.id) {
        explorePanel.hidden = true;
        unit.classList.remove("is-expanded");
        state.flowExpandedId = null;
        return;
      }
      $$(".is-flow-explore-panel", panel).forEach((p) => {
        p.hidden = true;
      });
      $$(".is-flow-unit", panel).forEach((u) => u.classList.remove("is-expanded"));
      state.flowExpandedId = flow.id;
      unit.classList.add("is-expanded");
      explorePanel.hidden = false;
      selectFlowUnit(flow.id);
      applyCardFilter({ tab: flow.tab, filterTag: flow.filterTag, scroll: false });
      syncCardActiveStates(flow.filterTag, null);
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
      applyCardFilter({ tab: flow.tab, filterTag: flow.filterTag, scroll: true });
    });
  });

  $("#isViewActivityB", panel)?.addEventListener("click", () => {
    state.filterTag = null;
    state.highlightRowId = null;
    clearCardActive();
    renderTable();
    scrollToData();
  });
}

function mountConceptC() {
  const panel = $("#conceptPanelC");
  if (!panel || panel.dataset.mounted) return;
  panel.dataset.mounted = "1";

  panel.innerHTML = `
    <div class="is-spots" id="isSpots"></div>
    <button type="button" class="is-view-activity" id="isViewActivityC">
      View Activity
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  const spotsEl = $("#isSpots", panel);
  CONCEPT_C.spots.forEach((spot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "is-spot-card";
    if (spot.filterTag) btn.dataset.filter = spot.filterTag;
    if (spot.rowId) btn.dataset.row = spot.rowId;
    btn.innerHTML = `
      <div class="spot-label">${escapeHtml(spot.label)}</div>
      <h3 class="spot-title">${escapeHtml(spot.title)}</h3>
      <p class="spot-body">${escapeHtml(spot.body)}</p>
    `;
    btn.addEventListener("click", () =>
      applyCardFilter({
        tab: spot.tab,
        filterTag: spot.filterTag,
        rowId: spot.rowId,
      })
    );
    spotsEl.appendChild(btn);
  });

  $("#isViewActivityC", panel)?.addEventListener("click", () => {
    state.filterTag = null;
    state.highlightRowId = null;
    clearCardActive();
    renderTable();
    scrollToData();
  });
}

function bindEvents() {
  $$(".is-concept-btn").forEach((btn) => {
    btn.addEventListener("click", () => setConcept(btn.dataset.concept));
  });

  $$(".is-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTab(btn.dataset.tab);
      if (state.filterTag || state.highlightRowId) renderTable();
    });
  });

  $("#isSearch")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    renderTable();
  });
}

function init() {
  mountConceptA();
  mountConceptB();
  mountConceptC();
  bindEvents();
  setConcept("a");
  setTab("corporate");
  renderTable();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
