/**
 * Intelligence Watchlist — draggable glass cards (wheel central panel).
 * @module preview/dashboard-preview-watchlist
 */

const WL_DEBUG = true;

function wlLog(...args) {
  if (WL_DEBUG) console.log("[watchlist]", ...args);
}

wlLog("watchlist module loaded");

/** Local quotes — avoid import failure blocking the whole module */
const PREVIEW_QUOTES = {
  SPY: { pctChange: 0.48, price: 512.2 },
  QQQ: { pctChange: 0.62, price: 445.1 },
  IWM: { pctChange: 0.08, price: 198.4 },
  NVDA: { pctChange: 1.98, price: 219.46 },
  XOM: { pctChange: 1.18, price: 118.62 },
};

const WATCHLIST_STORAGE_KEY = "brieftick_watchlist_v1";
const WATCHLIST_META_KEY = "brieftick_watchlist_meta_v1";
const MAX_SYMBOLS = 24;

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AAPL", "AMD", "META", "MSFT", "SPY", "QQQ"];
const watchlistNames = {
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AAPL: "Apple",
  AMD: "AMD",
  META: "Meta",
  MSFT: "Microsoft",
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  GOOG: "Alphabet",
  NFLX: "Netflix",
  COIN: "Coinbase",
};

let watchlistSymbols = [];
let watchlistPinned = new Set();
let latestWatchlistQuotes = {};
let lastAddedSymbol = null;
/** @type {HTMLElement | null} */
let watchlistRoot = null;
let dragSymbol = null;
let watchlistDelegatesReady = false;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanTickerSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 12);
}

function resolveTickerInput(value) {
  if (window.BrieftickMoversLookup?.resolveMoversSymbolInput) {
    return window.BrieftickMoversLookup.resolveMoversSymbolInput(value);
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  const firstToken = raw
    .toUpperCase()
    .replace(/[^A-Z0-9.\-\s]/g, "")
    .trim()
    .split(/\s+/)[0];
  return cleanTickerSymbol(firstToken || raw);
}

function hashSymbol(sym) {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getMockQuote(sym) {
  if (PREVIEW_QUOTES[sym]) {
    return { ...PREVIEW_QUOTES[sym], name: watchlistNames[sym] || sym };
  }
  const h = hashSymbol(sym);
  const pctChange = ((h % 401) - 200) / 100;
  const price = 20 + (h % 480) + (h % 100) / 100;
  return { name: watchlistNames[sym] || sym, pctChange, price };
}

function ensureDefaultWatchlist() {
  if (!Array.isArray(watchlistSymbols)) {
    watchlistSymbols = [];
  }
  watchlistSymbols = [...new Set(watchlistSymbols.map(cleanTickerSymbol).filter(Boolean))].slice(
    0,
    MAX_SYMBOLS
  );
  if (!watchlistSymbols.length) {
    watchlistSymbols = DEFAULT_WATCHLIST.slice();
  }
}

function loadWatchlistState() {
  watchlistPinned = new Set();
  watchlistSymbols = [];

  try {
    const meta = JSON.parse(localStorage.getItem(WATCHLIST_META_KEY) || "null");
    if (meta?.pinned && Array.isArray(meta.pinned)) {
      watchlistPinned = new Set(meta.pinned.map(cleanTickerSymbol).filter(Boolean));
    }
  } catch (e) {
    watchlistPinned = new Set();
  }

  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (raw != null && raw !== "") {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        watchlistSymbols = saved.map(cleanTickerSymbol).filter(Boolean);
      }
    }
  } catch (e) {
    watchlistSymbols = [];
  }

  ensureDefaultWatchlist();
  wlLog("watchlist data loaded", {
    count: watchlistSymbols.length,
    symbols: watchlistSymbols.slice(0, 8),
  });
}

function saveWatchlistState() {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
    localStorage.setItem(
      WATCHLIST_META_KEY,
      JSON.stringify({ pinned: [...watchlistPinned] })
    );
  } catch (e) {}
}

try {
  loadWatchlistState();
} catch (e) {
  watchlistSymbols = DEFAULT_WATCHLIST.slice();
  watchlistPinned = new Set();
  wlLog("watchlist state init failed — using defaults", e);
}

function getDisplayOrder() {
  const pinned = [];
  const unpinned = [];
  for (const s of watchlistSymbols) {
    if (watchlistPinned.has(s)) pinned.push(s);
    else unpinned.push(s);
  }
  return [...pinned, ...unpinned];
}

function setWatchlistMsg(text, type) {
  const el = watchlistRoot?.querySelector("#watchlistMsg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "intel-wl__toast";
  if (type === "error") el.classList.add("is-error");
  if (type === "success") el.classList.add("is-success");
  if (text) {
    clearTimeout(setWatchlistMsg._t);
    setWatchlistMsg._t = setTimeout(() => {
      el.textContent = "";
      el.className = "intel-wl__toast";
    }, 2800);
  }
}

function watchlistStatus(pct) {
  if (pct == null || isNaN(pct)) return { label: "Watching", cls: "watching" };
  if (Math.abs(pct) >= 2.5) return { label: "Volatile", cls: "volatile" };
  if (pct > 0.15) return { label: "Rising", cls: "rising" };
  if (pct < -0.15) return { label: "Falling", cls: "falling" };
  return { label: "Watching", cls: "watching" };
}

function watchlistInsight(sym, q) {
  const name = q?.name || watchlistNames[sym] || sym;
  const pct = q && !isNaN(q.pctChange) ? q.pctChange : null;
  if (pct == null) return `${name} on your radar — intelligence updating.`;
  if (pct >= 2.5) return `${name} is leading today's move with clear positive momentum.`;
  if (pct <= -2.5) return `${name} is under pressure — watch for a headline catalyst.`;
  if (pct > 0) return `${name} is ticking higher on a constructive session.`;
  if (pct < 0) return `${name} is softer — breadth has not confirmed yet.`;
  return `${name} is steady with no major intraday shift.`;
}

function renderTickerCard(sym) {
  const q = latestWatchlistQuotes[sym] || getMockQuote(sym);
  const name = q?.name || watchlistNames[sym] || sym;
  const pct = q && !isNaN(q.pctChange) ? q.pctChange : null;
  const status = watchlistStatus(pct);
  const insight = watchlistInsight(sym, q);
  const isPinned = watchlistPinned.has(sym);
  const isNew = sym === lastAddedSymbol;
  const chg =
    pct == null ? "" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const chgCls = pct == null ? "flat" : pct >= 0 ? "up" : "dn";

  return `<article
    class="intel-wl-card intel-wl-card--ticker${isPinned ? " is-pinned" : ""}${isNew ? " is-entering" : ""}"
    data-symbol="${escapeHtml(sym)}"
    draggable="true"
    tabindex="0"
    aria-grabbed="false"
  >
    <div class="intel-wl-card__glow" aria-hidden="true"></div>
    <div class="intel-wl-card__sheen" aria-hidden="true"></div>
    <div class="intel-wl-card__drag" aria-hidden="true"><span></span><span></span></div>
    <div class="intel-wl-card__inner">
      <header class="intel-wl-card__head">
        <span class="intel-wl-card__sym">${escapeHtml(sym)}</span>
        <span class="intel-wl-card__status intel-wl-card__status--${status.cls}">${escapeHtml(status.label)}</span>
      </header>
      <span class="intel-wl-card__company">${escapeHtml(name)}</span>
      <p class="intel-wl-card__insight">${escapeHtml(insight)}</p>
      <div class="intel-wl-card__expand" aria-hidden="true">
        ${chg ? `<span class="intel-wl-card__move intel-wl-card__move--${chgCls}">${chg}</span>` : ""}
      </div>
      <div class="intel-wl-card__actions">
        <button type="button" class="intel-wl-card__pin" data-action="pin" draggable="false" aria-pressed="${isPinned ? "true" : "false"}" aria-label="${isPinned ? "Unpin" : "Pin"} ${escapeHtml(sym)}">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M6 1 7.5 4.5 11 5.5 8.5 8 9 11.5 6 9.5 3 11.5 3.5 8 1 5.5 4.5 4.5z"/></svg>
        </button>
        <button type="button" class="intel-wl-card__remove" data-action="remove" draggable="false" aria-label="Remove ${escapeHtml(sym)}">×</button>
      </div>
    </div>
  </article>`;
}

function renderEmptyState() {
  return `<p class="intel-wl__empty" id="watchlistEmpty">No tickers yet — add one with the card below or restore defaults.</p>`;
}

function renderAddCard() {
  return `<article class="intel-wl-card intel-wl-card--add" data-card="add" tabindex="0">
    <div class="intel-wl-card__glow intel-wl-card__glow--add" aria-hidden="true"></div>
    <div class="intel-wl-card__add-face">
      <span class="intel-wl-card__add-icon" aria-hidden="true">+</span>
      <span class="intel-wl-card__add-label">Add ticker</span>
    </div>
    <div class="intel-wl-card__add-expand" hidden>
      <label class="intel-wl-card__add-field">
        <span class="intel-wl-card__add-hint">Symbol</span>
        <input type="text" class="intel-wl-card__add-input" id="watchlistAddInput" placeholder="NVDA" autocomplete="off" spellcheck="false" maxlength="12" aria-label="Ticker symbol">
      </label>
      <div class="intel-wl-card__add-actions">
        <button type="button" class="intel-wl-card__add-confirm" data-action="confirm-add">Add</button>
        <button type="button" class="intel-wl-card__add-cancel" data-action="cancel-add">Cancel</button>
      </div>
    </div>
  </article>`;
}

function getWatchlistGrid() {
  return (
    watchlistRoot?.querySelector("#watchlistGrid") ||
    document.getElementById("watchlistGrid")
  );
}

function renderWatchlist() {
  const grid = getWatchlistGrid();
  const meta =
    watchlistRoot?.querySelector("#watchlistMeta") ||
    document.getElementById("watchlistMeta");
  if (!grid) {
    wlLog("watchlist render skipped — #watchlistGrid not found");
    return false;
  }

  ensureDefaultWatchlist();

  if (meta) {
    const pinCount = watchlistSymbols.filter((s) => watchlistPinned.has(s)).length;
    meta.textContent =
      pinCount > 0
        ? `${watchlistSymbols.length} names · ${pinCount} pinned`
        : `${watchlistSymbols.length} names · drag to reorder`;
  }

  let tickerCards = "";
  try {
    const order = getDisplayOrder();
    tickerCards = order.map((sym) => {
      try {
        return renderTickerCard(sym);
      } catch (e) {
        return "";
      }
    }).join("");
  } catch (e) {
    tickerCards = "";
  }

  grid.innerHTML = renderAddCard() + tickerCards;

  if (lastAddedSymbol) {
    const sym = lastAddedSymbol;
    grid.querySelector(`[data-symbol="${sym}"]`)?.addEventListener(
      "animationend",
      () => {
        grid.querySelector(`[data-symbol="${sym}"]`)?.classList.remove("is-entering");
        if (lastAddedSymbol === sym) lastAddedSymbol = null;
      },
      { once: true }
    );
  }

  bindDragAndDrop(grid);
  return true;
}

function openAddCard() {
  const add = watchlistRoot?.querySelector('[data-card="add"]');
  if (!add) return;
  add.classList.add("is-expanded");
  add.querySelector(".intel-wl-card__add-face")?.setAttribute("hidden", "");
  const expand = add.querySelector(".intel-wl-card__add-expand");
  expand?.removeAttribute("hidden");
  const input = add.querySelector(".intel-wl-card__add-input");
  input?.focus();
}

function closeAddCard() {
  const add = watchlistRoot?.querySelector('[data-card="add"]');
  if (!add) return;
  add.classList.remove("is-expanded");
  add.querySelector(".intel-wl-card__add-face")?.removeAttribute("hidden");
  add.querySelector(".intel-wl-card__add-expand")?.setAttribute("hidden", "");
  const input = add.querySelector(".intel-wl-card__add-input");
  if (input) input.value = "";
}

function addWatchlistSymbol(raw) {
  const add = watchlistRoot?.querySelector('[data-card="add"]');
  const input = add?.querySelector(".intel-wl-card__add-input");
  const sym = resolveTickerInput(raw ?? input?.value) || cleanTickerSymbol(raw);
  if (!sym) {
    setWatchlistMsg("Enter a valid symbol", "error");
    return;
  }
  if (watchlistSymbols.includes(sym)) {
    setWatchlistMsg(`${sym} is already here`, "error");
    return;
  }
  if (watchlistSymbols.length >= MAX_SYMBOLS) {
    setWatchlistMsg("Workspace full (24 max)", "error");
    return;
  }
  watchlistSymbols.unshift(sym);
  latestWatchlistQuotes[sym] = getMockQuote(sym);
  saveWatchlistState();
  lastAddedSymbol = sym;
  closeAddCard();
  setWatchlistMsg(`${sym} added`, "success");
  renderWatchlist();
}

function removeWatchlistSymbol(symbol) {
  const sym = cleanTickerSymbol(symbol);
  watchlistSymbols = watchlistSymbols.filter((s) => s !== sym);
  watchlistPinned.delete(sym);
  delete latestWatchlistQuotes[sym];
  saveWatchlistState();
  setWatchlistMsg(`${sym} removed`, "success");
  renderWatchlist();
}

function togglePin(symbol) {
  const sym = cleanTickerSymbol(symbol);
  if (!watchlistSymbols.includes(sym)) return;
  if (watchlistPinned.has(sym)) {
    watchlistPinned.delete(sym);
    setWatchlistMsg(`${sym} unpinned`, "success");
  } else {
    watchlistPinned.add(sym);
    setWatchlistMsg(`${sym} pinned`, "success");
  }
  saveWatchlistState();
  renderWatchlist();
}

function reorderSymbol(sym, targetSym, insertAfter) {
  const from = watchlistSymbols.indexOf(sym);
  let to = watchlistSymbols.indexOf(targetSym);
  if (from < 0 || to < 0 || from === to) return;

  const next = [...watchlistSymbols];
  const [item] = next.splice(from, 1);
  to = next.indexOf(targetSym);
  const insertAt = insertAfter ? to + 1 : to;
  next.splice(insertAt, 0, item);
  watchlistSymbols = next;
  saveWatchlistState();
  renderWatchlist();
}

function bindDragAndDrop(grid) {
  grid.querySelectorAll(".intel-wl-card--ticker").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      dragSymbol = card.dataset.symbol;
      card.classList.add("is-dragging");
      e.dataTransfer?.setData("text/plain", dragSymbol);
      e.dataTransfer.effectAllowed = "move";
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      grid.querySelectorAll(".intel-wl-card").forEach((c) => c.classList.remove("is-drop-target"));
      dragSymbol = null;
    });

    card.addEventListener("dragover", (e) => {
      if (!dragSymbol || card.dataset.symbol === dragSymbol) return;
      e.preventDefault();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("is-drop-target");
      const target = card.dataset.symbol;
      if (!dragSymbol || !target || dragSymbol === target) return;
      const rect = card.getBoundingClientRect();
      const insertAfter = e.clientY > rect.top + rect.height / 2;
      reorderSymbol(dragSymbol, target, insertAfter);
    });
  });
}

function ensureWatchlistDelegates() {
  if (watchlistDelegatesReady) return;
  const stage = document.getElementById("wheelModuleStage");
  if (!stage) return;
  watchlistDelegatesReady = true;

  stage.addEventListener("click", (e) => {
    if (!e.target.closest(".rail-module--watchlist")) return;

    const addCard = e.target.closest('[data-card="add"]');
    if (addCard && !e.target.closest("[data-action]") && !addCard.classList.contains("is-expanded")) {
      openAddCard();
      return;
    }

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "confirm-add") {
      addWatchlistSymbol();
      return;
    }
    if (action === "cancel-add") {
      closeAddCard();
      return;
    }
    if (action === "remove") {
      const sym = e.target.closest(".intel-wl-card--ticker")?.dataset.symbol;
      if (sym) removeWatchlistSymbol(sym);
      return;
    }
    if (action === "pin") {
      const sym = e.target.closest(".intel-wl-card--ticker")?.dataset.symbol;
      if (sym) togglePin(sym);
    }
  });

  stage.addEventListener("keydown", (e) => {
    if (!e.target.closest(".rail-module--watchlist")) return;
    const input = e.target.closest(".intel-wl-card__add-input");
    if (input && e.key === "Enter") {
      e.preventDefault();
      addWatchlistSymbol();
    }
    if (e.key === "Escape") closeAddCard();
  });
}

export function renderWatchlistModule() {
  return `<div class="rail-module rail-module--watchlist rail-module--intel-wl is-visible">
    <div class="intel-wl is-visible">
      <header class="intel-wl__header">
        <h2 class="intel-wl__title">Watchlist</h2>
        <span class="intel-wl__meta" id="watchlistMeta">Intelligence workspace</span>
      </header>
      <div class="intel-wl__toast" id="watchlistMsg" aria-live="polite"></div>
      <div class="intel-wl__grid" id="watchlistGrid" role="list">${renderAddCard()}${renderEmptyState()}</div>
    </div>
  </div>`;
}

function revealWatchlistPanel() {
  const intel = watchlistRoot?.querySelector(".intel-wl");
  if (!intel) return;
  intel.classList.add("is-visible");
  requestAnimationFrame(() => intel.classList.add("is-visible"));
}

export function bindWatchlistPanel(root) {
  watchlistRoot =
    root?.querySelector?.(".rail-module--watchlist") ||
    document.querySelector(".rail-module--watchlist") ||
    root;
  ensureDefaultWatchlist();
  latestWatchlistQuotes = {};
  try {
    for (const sym of watchlistSymbols) {
      latestWatchlistQuotes[sym] = getMockQuote(sym);
    }
  } catch (e) {
    wlLog("quote preload failed", e);
    latestWatchlistQuotes = {};
  }
  let rendered = false;
  try {
    rendered = renderWatchlist();
  } catch (e) {
    wlLog("watchlist render error", e);
  }
  if (!rendered) {
    const grid = getWatchlistGrid();
    if (grid) {
      grid.innerHTML = renderAddCard() + renderEmptyState();
      wlLog("watchlist fallback shell painted");
    }
  }
  try {
    ensureWatchlistDelegates();
  } catch (e) {
    wlLog("watchlist delegates error", e);
  }
  revealWatchlistPanel();
}
