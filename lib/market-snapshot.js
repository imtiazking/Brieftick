/**
 * Market Snapshot UI — per-row live fetch, fast retries, proxy labels.
 * @module lib/market-snapshot
 */

import {
  fetchSnapshotRow,
  getLoadingMarketSnapshot,
  checkMarketDataApiStatus,
  ROW_ORDER,
  ROW_META,
  loadingInstrument,
  retryingInstrument,
  unavailableInstrument,
  formatLevelDisplay,
  formatChangeDisplay,
  changeTone,
} from "/lib/marketDataService.js";

const ROW_LABELS = {
  sp500: "S&P 500",
  nasdaq: "Nasdaq",
  dow: "Dow",
  vix: "VIX",
  oil: "Oil (WTI)",
  tenYearYield: "10Y Yield",
  spy: "SPY",
  qqq: "QQQ",
};

/** @type {number[]} */
const RETRY_MS = [3000, 8000, 15000];

/**
 * @param {string} iso
 */
function formatUpdatedTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * @param {import('/lib/marketDataService.js').SnapshotInstrument} inst
 * @param {string} key
 * @param {{ kind?: string }} meta
 */
function formatRowTooltip(inst, key, meta) {
  if (inst.status === "unavailable") {
    return inst.error || "Live source unavailable";
  }
  if (inst.status === "loading" || inst.status === "retrying") {
    return inst.rowMessage || "Loading…";
  }
  const parts = [];
  if (inst.isProxy) parts.push(`Proxy ETF: ${inst.proxySymbol || "—"}`);
  if (inst.source) parts.push(`Source: ${inst.source}`);
  if (inst.updatedAt) parts.push(`Updated: ${formatUpdatedTime(inst.updatedAt)}`);
  if (inst.fredDate) parts.push(`FRED: ${inst.fredDate}`);
  if (inst.status === "ok" || inst.status === "proxy") {
    if (inst.changePercent != null && meta.kind !== "yield") {
      const sign = inst.changePercent >= 0 ? "+" : "−";
      parts.push(`Change: ${sign}${Math.abs(inst.changePercent).toFixed(2)}%`);
    }
    if (inst.change != null && meta.kind === "yield") {
      const bp = Math.round(inst.change * 100);
      const sign = bp >= 0 ? "+" : "−";
      parts.push(`Change: ${sign}${Math.abs(bp)} bp`);
    }
  }
  return parts.join(" · ") || "Live quote";
}

/**
 * @param {HTMLElement} root
 */
function ensureSnapshotShell(root) {
  if (!root) return null;
  if (root.querySelector("[data-snapshot-grid]")) return root;

  root.innerHTML = `
    <h2 class="briefing-snapshot__title">Market Snapshot</h2>
    <p class="briefing-snapshot__note" data-snapshot-note>
      Market data updates from live API sources. Last updated: …
    </p>
    <ul class="briefing-snapshot__grid" data-snapshot-grid></ul>`;

  const grid = root.querySelector("[data-snapshot-grid]");
  for (const key of ROW_ORDER) {
    const li = document.createElement("li");
    li.className = "briefing-snapshot__row is-loading";
    li.dataset.snapshotKey = key;
    li.innerHTML = `
      <div class="briefing-snapshot__namecol">
        <span class="briefing-snapshot__name" data-snapshot-name>${ROW_LABELS[key]}</span>
        <span class="briefing-snapshot__status" data-snapshot-status>Loading live source…</span>
      </div>
      <span class="briefing-snapshot__level" data-snapshot-level>…</span>
      <span class="briefing-snapshot__chg is-flat" data-snapshot-chg>…</span>`;
    grid.appendChild(li);
  }
  return root;
}

/**
 * @param {HTMLElement} root
 * @param {string|null} fetchedAt
 */
function updateSnapshotNote(root, fetchedAt) {
  const note = root.querySelector("[data-snapshot-note]");
  if (!note) return;
  note.textContent = `Market data updates from live API sources. Last updated: ${formatUpdatedTime(fetchedAt)}`;
}

/**
 * @param {HTMLElement} root
 * @param {string} key
 * @param {import('/lib/marketDataService.js').SnapshotInstrument} inst
 */
export function renderSnapshotRow(root, key, inst) {
  if (!root || !inst) return;

  const row = root.querySelector(`[data-snapshot-key="${key}"]`);
  if (!row) return;

  const meta = ROW_META[key] || { kind: "etf" };
  const nameEl = row.querySelector("[data-snapshot-name]");
  const statusEl = row.querySelector("[data-snapshot-status]");
  const levelEl = row.querySelector("[data-snapshot-level]");
  const chgEl = row.querySelector("[data-snapshot-chg]");

  row.classList.remove("is-loading", "is-retrying", "is-unavailable", "is-ok", "is-proxy", "is-stale");

  if (nameEl) nameEl.textContent = inst.label || ROW_LABELS[key];

  if (inst.status === "loading") {
    row.classList.add("is-loading");
    if (statusEl) statusEl.textContent = inst.rowMessage || "Loading live source…";
    if (levelEl) levelEl.textContent = "…";
    if (chgEl) {
      chgEl.textContent = "…";
      chgEl.className = "briefing-snapshot__chg is-flat";
    }
    row.title = "";
    return;
  }

  if (inst.status === "retrying") {
    row.classList.add("is-retrying");
    if (statusEl) statusEl.textContent = "Retrying live source…";
    if (levelEl) levelEl.textContent = "…";
    if (chgEl) {
      chgEl.textContent = "…";
      chgEl.className = "briefing-snapshot__chg is-flat";
    }
    row.title = "Retrying live source…";
    return;
  }

  if (inst.status === "unavailable") {
    row.classList.add("is-unavailable");
    if (statusEl) statusEl.textContent = inst.rowMessage || "Live source unavailable";
    if (levelEl) {
      levelEl.textContent =
        key === "tenYearYield" ? "Delayed / unavailable" : "—";
    }
    if (chgEl) {
      chgEl.textContent = "—";
      chgEl.className = "briefing-snapshot__chg is-flat";
    }
    row.title = formatRowTooltip(inst, key, meta);
    return;
  }

  row.classList.add(inst.status === "proxy" ? "is-proxy" : "is-ok");
  if (statusEl) {
    statusEl.textContent = inst.isProxy
      ? `Proxy · ${inst.proxySymbol || "ETF"}`
      : inst.rowMessage || "";
  }
  const tone = changeTone(inst);
  if (levelEl) levelEl.textContent = formatLevelDisplay(inst, meta);
  if (chgEl) {
    chgEl.textContent = formatChangeDisplay(inst, meta);
    chgEl.className = `briefing-snapshot__chg is-${tone}`;
  }
  row.title = formatRowTooltip(inst, key, meta);
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, import('/lib/marketDataService.js').SnapshotInstrument>} rows
 */
export function renderMarketSnapshot(root, rows) {
  if (!root) return;
  ensureSnapshotShell(root);
  for (const key of ROW_ORDER) {
    if (rows[key]) renderSnapshotRow(root, key, rows[key]);
  }
}

/**
 * @param {string|HTMLElement} rootSelector
 */
function resolveRoot(rootSelector) {
  if (typeof rootSelector === "string") {
    return document.querySelector(rootSelector);
  }
  return rootSelector;
}

/**
 * @param {HTMLElement} root
 * @param {string} key
 * @param {number} attempt
 * @param {(key: string, inst: import('/lib/marketDataService.js').SnapshotInstrument) => void} onUpdate
 * @param {() => void} onSuccessTime
 */
async function loadRowWithRetries(root, key, attempt, onUpdate, onSuccessTime) {
  if (attempt > 0) {
    onUpdate(key, retryingInstrument(key));
  } else {
    onUpdate(key, loadingInstrument(key));
  }

  const inst = await fetchSnapshotRow(key);
  onUpdate(key, inst);

  const success = inst.status === "ok" || inst.status === "proxy";
  if (success) {
    onSuccessTime();
    return;
  }

  if (attempt < RETRY_MS.length) {
    const delay = RETRY_MS[attempt];
    console.info("[market-snapshot] scheduling retry", { key, attempt: attempt + 1, delayMs: delay });
    setTimeout(() => {
      loadRowWithRetries(root, key, attempt + 1, onUpdate, onSuccessTime);
    }, delay);
    return;
  }

  console.warn("[market-snapshot] row failed after retries", { key, attempts: RETRY_MS.length + 1 });
  onUpdate(key, unavailableInstrument(key));
}

/**
 * @param {{ root?: string|HTMLElement, refreshMs?: number }} [opts]
 */
export function mountMarketSnapshot(opts = {}) {
  const refreshMs = opts.refreshMs ?? 60_000;
  const root = resolveRoot(opts.root ?? ".briefing-snapshot");
  if (!root) {
    console.warn("[market-snapshot] mount skipped — root not found", opts.root);
    return () => {};
  }

  ensureSnapshotShell(root);

  /** @type {Record<string, import('/lib/marketDataService.js').SnapshotInstrument>} */
  const rowState = getLoadingMarketSnapshot();
  let lastFetchedAt = null;
  let refreshTimer = null;

  const publish = () => {
    window.__briefingMarketSnapshot = { ...rowState, fetchedAt: lastFetchedAt };
  };

  const onUpdate = (key, inst) => {
    rowState[key] = inst;
    renderSnapshotRow(root, key, inst);
    publish();
  };

  const onSuccessTime = () => {
    lastFetchedAt = new Date().toISOString();
    updateSnapshotNote(root, lastFetchedAt);
  };

  checkMarketDataApiStatus().catch((e) => {
    console.warn("[market-snapshot] API status check error", e);
  });

  for (const key of ROW_ORDER) {
    renderSnapshotRow(root, key, rowState[key]);
  }
  publish();

  for (const key of ROW_ORDER) {
    loadRowWithRetries(root, key, 0, onUpdate, onSuccessTime);
  }

  refreshTimer = setInterval(() => {
    for (const key of ROW_ORDER) {
      const current = rowState[key];
      if (current?.status === "ok" || current?.status === "proxy") {
        fetchSnapshotRow(key).then((inst) => {
          if (inst.status === "ok" || inst.status === "proxy") {
            onUpdate(key, inst);
            onSuccessTime();
          }
        });
      } else if (current?.status === "unavailable") {
        loadRowWithRetries(root, key, 0, onUpdate, onSuccessTime);
      }
    }
  }, refreshMs);

  return () => {
    if (refreshTimer) clearInterval(refreshTimer);
  };
}
