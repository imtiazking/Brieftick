/**
 * Logic portfolio panel — paste, import, watchlist (preview-only injection).
 * Scoped to #page-logic; does not modify dashboard layout.
 */

import {
  parsePortfolioPaste,
  savePortfolioHoldings,
  loadSavedPortfolio,
} from "../logic/portfolioParser.js";
import {
  importPortfolioFile,
  importPortfolioFiles,
} from "../logic/engines/portfolioImportEngine.js";
import {
  getLogicWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  inferWatchlistExposure,
  saveLogicWatchlist,
} from "../logic/watchlistStore.js";

/** Align Logic store with main dashboard watchlist when Logic storage is empty. */
function syncLogicWatchlistFromDashboard() {
  if (getLogicWatchlist().length) return;
  try {
    const dash =
      typeof window.getWatchlistSymbols === "function"
        ? window.getWatchlistSymbols()
        : Array.isArray(window.watchlistSymbols)
          ? window.watchlistSymbols
          : [];
    if (dash?.length) saveLogicWatchlist(dash);
  } catch (_) {}
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Inject compact portfolio + watchlist controls into Logic hub.
 */
export function mountLogicPortfolioPanel() {
  const hub =
    document.getElementById("logicPortfolioMount") ||
    document.getElementById("logicIntelligenceHub");
  if (!hub || document.getElementById("logicPortfolioPanel")) return;

  syncLogicWatchlistFromDashboard();
  const saved = loadSavedPortfolio();
  const watch = getLogicWatchlist();

  const section = document.createElement("div");
  section.id = "logicPortfolioPanel";
  section.className = "logic-hub-section logic-hub-section--wide logic-portfolio-panel--compact";
  section.innerHTML = `
    <div class="logic-hub-head">
      <span class="logic-hub-title">Book & watchlist</span>
      <span class="logic-hub-live" id="logicPortfolioStatus">${saved?.holdings?.length ? `${saved.holdings.length} saved` : "Paste or import"}</span>
    </div>
    <p class="logic-intel-text" style="margin:0 0 8px;font-size:10px;opacity:.85">Paste weights or add tickers — stored locally in this browser.</p>
    <textarea id="logicPortfolioPaste" class="logic-hero-input" style="width:100%;min-height:72px;font-size:12px;margin-bottom:8px" spellcheck="false" placeholder="NVDA 30%&#10;MSFT 20%&#10;META 15%&#10;Cash 15%"></textarea>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <button type="button" class="logic-hero-chip" id="logicPortfolioSave">Save holdings</button>
      <label class="logic-hero-chip" style="cursor:pointer;margin:0">
        Import file
        <input type="file" id="logicPortfolioFile" accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp" hidden />
      </label>
      <span class="logic-hero-chip" id="logicPortfolioDrop" style="opacity:.85">Drop file here</span>
    </div>
    <div class="logic-watchlist-row" style="margin-bottom:6px" id="logicWatchlistManage"></div>
    <div style="display:flex;gap:6px">
      <input type="text" id="logicWatchlistAdd" class="logic-hero-input" style="flex:1;font-size:12px" placeholder="NVDA or NVDA, MSFT" maxlength="80" />
      <button type="button" class="logic-hero-chip" id="logicWatchlistAddBtn">Add</button>
    </div>
    <p class="logic-intel-text" id="logicWatchlistExposure" style="margin:8px 0 0;font-size:10px;opacity:.9"></p>
  `;

  hub.appendChild(section);

  const paste = document.getElementById("logicPortfolioPaste");
  if (saved?.holdings?.length && paste) {
    paste.value = saved.holdings.map((h) => `${h.symbol} ${h.weight}%`).join("\n");
  }

  renderWatchlistManage(watch);
  updateExposureLine();

  document.getElementById("logicPortfolioSave")?.addEventListener("click", () => {
    const holdings = parsePortfolioPaste(paste?.value || "");
    if (!holdings.length) {
      setStatus("Could not parse — check format");
      return;
    }
    savePortfolioHoldings(holdings);
    setStatus(`Saved ${holdings.length} positions`);
    updateExposureLine();
  });

  const fileInput = document.getElementById("logicPortfolioFile");
  fileInput?.addEventListener("change", async () => {
    const res = await importPortfolioFile(fileInput.files?.[0]);
    setStatus(res.message || (res.ok ? "Imported" : "Failed"));
    if (res.ok && paste) {
      paste.value = res.holdings.map((h) => `${h.symbol} ${h.weight}%`).join("\n");
    }
    fileInput.value = "";
    updateExposureLine();
  });

  const drop = document.getElementById("logicPortfolioDrop");
  if (drop) {
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.style.borderColor = "rgba(212,175,55,.5)";
    });
    drop.addEventListener("dragleave", () => {
      drop.style.borderColor = "";
    });
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.style.borderColor = "";
      const res = await importPortfolioFiles(e.dataTransfer?.files);
      setStatus(res.message || "");
      if (res.ok && paste) {
        paste.value = res.holdings.map((h) => `${h.symbol} ${h.weight}%`).join("\n");
      }
      updateExposureLine();
    });
  }

  const addInput = document.getElementById("logicWatchlistAdd");
  const commitWatchlistInput = () => {
    const sym = addInput?.value?.trim();
    if (!sym) return;
    addWatchlistSymbol(sym);
    if (addInput) addInput.value = "";
    renderWatchlistManage(getLogicWatchlist());
    updateExposureLine();
    refreshHubWatchlist();
  };

  document.getElementById("logicWatchlistAddBtn")?.addEventListener("click", commitWatchlistInput);
  addInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitWatchlistInput();
    }
  });
}

function setStatus(msg) {
  const el = document.getElementById("logicPortfolioStatus");
  if (el) el.textContent = msg;
}

function renderWatchlistManage(symbols) {
  const el = document.getElementById("logicWatchlistManage");
  if (!el) return;
  if (!symbols.length) {
    el.innerHTML =
      '<span class="logic-intel-text" style="font-size:11px;opacity:.85">No tickers saved — type symbols above and click Add (or press Enter).</span>';
    return;
  }
  el.innerHTML = symbols
    .slice(0, 12)
    .map(
      (s) =>
        `<button type="button" class="logic-watch-pill" data-remove-watch="${escapeHtml(s)}">${escapeHtml(s)} ×</button>`
    )
    .join("");
  el.querySelectorAll("[data-remove-watch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeWatchlistSymbol(btn.dataset.removeWatch);
    renderWatchlistManage(getLogicWatchlist());
    updateExposureLine();
    refreshHubWatchlist();
    if (typeof window.refreshLogicContextSidebar === "function") {
      window.refreshLogicContextSidebar();
    }
  });
});
}

function updateExposureLine() {
  const el = document.getElementById("logicWatchlistExposure");
  if (!el) return;
  const exp = inferWatchlistExposure();
  const saved = loadSavedPortfolio();
  const pf = saved?.profile;
  const parts = [exp.summary];
  if (pf?.aiWeight) parts.push(`Book: AI ~${pf.aiWeight}% · ${pf.concentrationLabel}.`);
  el.textContent = parts.join(" ");
}

function refreshHubWatchlist() {
  if (typeof window.refreshLogicContextSidebar === "function") {
    window.refreshLogicContextSidebar();
  }
  const hub = document.getElementById("logicHubWatchlist");
  if (!hub) return;
  const symbols = getLogicWatchlist();
  if (!symbols.length) {
    hub.innerHTML =
      '<span class="logic-intel-text" style="font-size:10px;opacity:.8">Add watchlist tickers below to enable quick prompts.</span>';
    return;
  }
  hub.innerHTML = symbols
    .slice(0, 8)
    .map(
      (s) =>
        `<button type="button" class="logic-watch-pill" data-prompt="Why is ${escapeHtml(s)} moving?">${escapeHtml(s)}</button>`
    )
    .join("");
  hub.querySelectorAll("[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (typeof window.submitLogicQuery === "function") {
        window.submitLogicQuery(btn.dataset.prompt);
      }
    });
  });
}
