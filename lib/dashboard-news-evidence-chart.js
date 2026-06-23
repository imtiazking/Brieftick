/**
 * Live Story Evidence Chart — auditable inputs for Dashboard News stories.
 * @module lib/dashboard-news-evidence-chart
 */

/**
 * @typedef {'pct' | 'bp' | 'price' | 'spread'} EvidenceBarScale
 * @typedef {Object} EvidenceRow
 * @property {string} id
 * @property {string} label
 * @property {number | null} value
 * @property {string} displayValue
 * @property {number} barValue
 * @property {EvidenceBarScale} barScale
 */

/**
 * @param {number | null | undefined} pct
 */
function fmtPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * @param {number | null | undefined} v
 */
function hasNum(v) {
  return v != null && !Number.isNaN(v);
}

/**
 * @param {Record<string, { pctChange?: number }>} quotes
 * @param {string} sym
 */
function qPct(quotes, sym) {
  return quotes?.[sym]?.pctChange;
}

/**
 * @param {string} storyId
 * @param {object} input
 * @param {Record<string, { pctChange?: number }>} [input.quotes]
 * @param {{ dgs10?: number | null, dgs10Change?: number | null }} [input.rates]
 * @param {{ price?: number | null, change?: number | null }} [input.oil]
 * @returns {EvidenceRow[]}
 */
export function buildStoryEvidenceRows(storyId, input) {
  const { quotes = {}, rates = {}, oil = {} } = input;
  /** @type {EvidenceRow[]} */
  const rows = [];

  const addPct = (id, label, sym) => {
    const pct = qPct(quotes, sym);
    if (!hasNum(pct)) return;
    rows.push({
      id,
      label,
      value: pct,
      displayValue: fmtPct(pct),
      barValue: pct,
      barScale: "pct",
    });
  };

  const addSpread = (id, label, a, b) => {
    const va = qPct(quotes, a);
    const vb = qPct(quotes, b);
    if (!hasNum(va) || !hasNum(vb)) return;
    const spread = va - vb;
    rows.push({
      id,
      label,
      value: spread,
      displayValue: fmtPct(spread),
      barValue: spread,
      barScale: "pct",
    });
  };

  if (storyId === "inflation") {
    if (hasNum(rates.dgs10)) {
      const ch = rates.dgs10Change;
      const chTxt =
        hasNum(ch) && Math.abs(ch) > 0.0001
          ? ` (${ch >= 0 ? "+" : ""}${Math.round(ch * 100)} bp)`
          : "";
      rows.push({
        id: "dgs10",
        label: "10Y Treasury",
        value: rates.dgs10,
        displayValue: `${rates.dgs10.toFixed(2)}%${chTxt}`,
        barValue: hasNum(ch) ? ch * 100 : 0,
        barScale: "bp",
      });
    }
    addPct("XLF", "XLF", "XLF");
    addPct("XLK", "XLK", "XLK");
    addPct("SPY", "SPY", "SPY");
  } else if (storyId === "europe") {
    addPct("SPY", "SPY", "SPY");
    addPct("EWG", "EWG", "EWG");
    addPct("UUP", "UUP", "UUP");
    addSpread("spread-spy-ewg", "SPY minus EWG spread", "SPY", "EWG");
  } else if (storyId === "energy") {
    if (hasNum(oil.price)) {
      const ch = oil.change;
      let display = `$${oil.price.toFixed(2)}`;
      if (hasNum(ch)) {
        const sign = ch >= 0 ? "+" : "−";
        display += ` (${sign}$${Math.abs(ch).toFixed(2)})`;
      }
      const barValue = hasNum(ch) && oil.price ? (ch / oil.price) * 100 : 0;
      rows.push({
        id: "wti",
        label: "WTI",
        value: oil.price,
        displayValue: display,
        barValue,
        barScale: "price",
      });
    }
    addPct("XLE", "XLE", "XLE");
    addPct("XOM", "XOM", "XOM");
    addSpread("spread-xle-spy", "XLE minus SPY spread", "XLE", "SPY");
  } else if (storyId === "ai") {
    addPct("NVDA", "NVDA", "NVDA");
    addPct("AMD", "AMD", "AMD");
    addPct("AVGO", "AVGO", "AVGO");
    addPct("SOXX", "SOXX", "SOXX");
    addPct("QQQ", "QQQ", "QQQ");
  }

  return rows;
}

/**
 * @param {EvidenceRow[]} rows
 */
export function normalizeEvidenceBarWidth(row, rows) {
  const pctRows = rows.filter((r) => r.barScale === "pct" || r.barScale === "spread");
  const bpRows = rows.filter((r) => r.barScale === "bp");
  const priceRows = rows.filter((r) => r.barScale === "price");

  let max = 1;
  if (row.barScale === "bp") {
    max = Math.max(...bpRows.map((r) => Math.abs(r.barValue)), 1);
  } else if (row.barScale === "price") {
    max = Math.max(...priceRows.map((r) => Math.abs(r.barValue)), 0.5);
  } else {
    max = Math.max(...pctRows.map((r) => Math.abs(r.barValue)), 0.5);
  }
  return Math.min(100, (Math.abs(row.barValue) / max) * 100);
}

/**
 * @param {EvidenceRow} row
 */
function barDirection(row) {
  if (row.barValue > 0.02) return "up";
  if (row.barValue < -0.02) return "down";
  return "flat";
}

/**
 * @param {string} s
 */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {EvidenceRow[]} rows
 */
export function renderEvidenceRowsHtml(rows) {
  if (!rows.length) {
    return `<li class="news-evidence-chart__row news-evidence-chart__row--empty">
      <span class="news-evidence-chart__label">Awaiting live inputs</span>
      <span class="news-evidence-chart__value">—</span>
    </li>`;
  }
  return rows
    .map((row) => {
      const width = normalizeEvidenceBarWidth(row, rows);
      const dir = barDirection(row);
      const valueAttr =
        row.value != null && !Number.isNaN(row.value) ? String(row.value) : "";
      return `<li class="news-evidence-chart__row news-evidence-chart__row--${dir}"
        data-evidence-row-id="${esc(row.id)}"
        data-evidence-value="${esc(valueAttr)}"
        data-evidence-display="${esc(row.displayValue)}">
        <span class="news-evidence-chart__label">${esc(row.label)}</span>
        <div class="news-evidence-chart__bar-wrap" aria-hidden="true">
          <div class="news-evidence-chart__bar-track">
            <div class="news-evidence-chart__bar news-evidence-chart__bar--${dir}" style="width:${width.toFixed(1)}%"></div>
          </div>
        </div>
        <span class="news-evidence-chart__value">${esc(row.displayValue)}</span>
      </li>`;
    })
    .join("");
}

/**
 * @param {string} storyId
 * @returns {string}
 */
export function renderNewsEvidenceChartShell(storyId) {
  return `<div class="news-narrative__visual" data-news-evidence-chart data-visual="${esc(storyId)}">
    <div class="news-evidence-chart" role="img" aria-label="Story evidence chart">
      <p class="news-evidence-chart__header">Story Evidence</p>
      <ul class="news-evidence-chart__rows" data-evidence-rows>
        <li class="news-evidence-chart__row news-evidence-chart__row--empty">
          <span class="news-evidence-chart__label">Loading live inputs…</span>
          <span class="news-evidence-chart__value">—</span>
        </li>
      </ul>
      <p class="news-evidence-chart__footer" data-evidence-footer>Source: — · Updated: —</p>
    </div>
  </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {{ id: string, live?: { evidenceRows?: EvidenceRow[], sourceLabel?: string, updatedAtUtc?: string } }} story
 */
export function applyStoryEvidenceChart(root, story) {
  if (!root || !story) return;
  const visual = root.querySelector("[data-news-evidence-chart]");
  if (!visual) return;

  visual.dataset.visual = story.id;
  const rows = story.live?.evidenceRows || [];
  const rowsEl = visual.querySelector("[data-evidence-rows]");
  const footerEl = visual.querySelector("[data-evidence-footer]");

  if (rowsEl) {
    rowsEl.innerHTML = renderEvidenceRowsHtml(rows);
  }
  if (footerEl) {
    const source = story.live?.sourceLabel || "Source: live market data";
    const updated = story.live?.updatedAtUtc || "—";
    footerEl.textContent = `${source} · Updated: ${updated}`;
  }
}
