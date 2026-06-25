/**
 * Portfolio Insights · production
 * @module lib/portfolio-insights
 */

const BASKETS = [
  {
    id: "ai",
    title: "AI Infrastructure",
    story:
      "Data-centre build-out and GPU demand favour chip, networking, and cloud platforms.",
    tickers: ["NVDA", "AMD", "AVGO", "MSFT", "ANET"],
    risk:
      "Concentrated mega-cap theme exposure. Momentum can reverse on capex or regulation headlines.",
  },
  {
    id: "cyber",
    title: "Cybersecurity",
    story:
      "Enterprise security spend rises as breaches and compliance pressure intensify.",
    tickers: ["CRWD", "PANW", "ZS", "FTNT"],
    risk:
      "High valuation multiples. Earnings misses often trigger sharp group drawdowns.",
  },
  {
    id: "energy",
    title: "Energy",
    story:
      "Producers and infrastructure exposed to supply, demand, and geopolitical shocks.",
    tickers: ["XOM", "CVX", "COP", "SLB"],
    risk:
      "Commodity-linked volatility. Moves with oil and gas prices, not equity beta alone.",
  },
  {
    id: "health",
    title: "Healthcare",
    story:
      "Large-cap pharma and devices with defensive characteristics and policy sensitivity.",
    tickers: ["LLY", "UNH", "JNJ", "ABBV"],
    risk:
      "Regulatory and reimbursement risk. Single trial headlines can dominate returns.",
  },
];

/**
 * Broker registry — set `status` to `connected` or `connect` when integrations ship.
 * @type {Array<{ id: string, name: string, mark: string, status: 'coming_soon'|'connect'|'connected', url: string }>}
 */
export const BROKERS = [
  {
    id: "trading212",
    name: "Trading 212",
    mark: "212",
    status: "coming_soon",
    url: "https://www.trading212.com/",
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    mark: "IB",
    status: "coming_soon",
    url: "https://www.interactivebrokers.com/",
  },
  {
    id: "etoro",
    name: "eToro",
    mark: "eT",
    status: "coming_soon",
    url: "https://www.etoro.com/",
  },
  {
    id: "ig",
    name: "IG",
    mark: "IG",
    status: "coming_soon",
    url: "https://www.ig.com/",
  },
];

const INTRO_DISMISS_KEY = "bt_pi_intro_dismissed";
const CONTINUE_LABEL = "Continue to Broker";

function stockCountLabel(n) {
  return `${n} compan${n === 1 ? "y" : "ies"} selected`;
}

function getBasketDef(basketEl) {
  const id = basketEl?.dataset?.basket;
  return BASKETS.find((b) => b.id === id) ?? null;
}

function getBasketTitle(basketEl) {
  return basketEl?.querySelector("h3")?.textContent || getBasketDef(basketEl)?.title || "Basket";
}

function getSelectedTickers(basketEl) {
  return [...basketEl.querySelectorAll(".pi-chip.is-selected")].map(
    (c) => c.dataset.ticker
  );
}

function formatTickerLine(tickers) {
  return tickers.length ? tickers.join(" • ") : "";
}

function brokerStatusLabel(status) {
  if (status === "connected") return "● Connected";
  if (status === "connect") return "Connect";
  return "Coming Soon";
}

function brokerStatusClass(status) {
  return `pi-broker__status--${status.replace("_", "-")}`;
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    document.body.style.overflow = "hidden";
  } else if (
    !mountedRoot?.querySelector(".pi-exec-modal.is-open, .pi-basket-review.is-open")
  ) {
    document.body.style.overflow = "";
  }
}

function updateBasketCard(basketEl) {
  const selected = getSelectedTickers(basketEl);
  const countEl = basketEl.querySelector("[data-selected-count]");
  const previewEl = basketEl.querySelector("[data-basket-preview]");
  const continueBtn = basketEl.querySelector("[data-basket-continue]");
  const continueHintEl = basketEl.querySelector("[data-continue-hint]");
  const openBtn = basketEl.querySelector("[data-open-basket]");
  const openHintEl = basketEl.querySelector("[data-open-hint]");

  if (countEl) countEl.textContent = stockCountLabel(selected.length);

  if (previewEl) {
    previewEl.textContent = selected.length
      ? formatTickerLine(selected)
      : "No companies selected yet";
    previewEl.classList.toggle("is-empty", selected.length === 0);
  }

  const empty = selected.length === 0;
  if (continueBtn) {
    continueBtn.disabled = empty;
    continueBtn.classList.toggle("is-disabled", empty);
  }
  if (continueHintEl) {
    continueHintEl.hidden = !empty;
  }
  if (openBtn) {
    openBtn.disabled = empty;
    openBtn.classList.toggle("is-disabled", empty);
  }
  if (openHintEl) {
    openHintEl.hidden = !empty;
  }
}

function renderBrokerIntegrations(root) {
  const grid = root.querySelector("#piBrokers");
  if (!grid) return;
  grid.innerHTML = BROKERS.map(
    (b) => `
    <div class="pi-broker" data-broker-id="${b.id}">
      <span class="pi-broker__mark" aria-hidden="true">${b.mark}</span>
      <span class="pi-broker__name">${b.name}</span>
      <span class="pi-broker__status ${brokerStatusClass(b.status)}">${brokerStatusLabel(b.status)}</span>
    </div>`
  ).join("");
}

function renderExecutionBrokers(container, selectedId) {
  if (!container) return;
  container.innerHTML = BROKERS.map((b) => {
    const interactive = b.status === "connected" || b.status === "connect";
    const selected = selectedId === b.id;
    return `
    <button
      type="button"
      class="pi-exec-broker${selected ? " is-selected" : ""}${interactive ? "" : " is-muted"}"
      data-broker-pick="${b.id}"
      data-broker-status="${b.status}"
      ${interactive ? "" : "disabled"}
      aria-pressed="${selected ? "true" : "false"}"
      role="option"
    >
      <span class="pi-exec-broker__mark" aria-hidden="true">${b.mark}</span>
      <span class="pi-exec-broker__name">${b.name}</span>
      <span class="pi-exec-broker__status ${brokerStatusClass(b.status)}">${brokerStatusLabel(b.status)}</span>
    </button>`;
  }).join("");
}

function renderBaskets(root) {
  const grid = root.querySelector("#piBaskets");
  if (!grid) return;

  grid.innerHTML = BASKETS.map((b) => {
    const initialLine = formatTickerLine(b.tickers);
    return `
    <article class="pi-basket" data-basket="${b.id}">
      <h3>${b.title}</h3>
      <p class="pi-basket__story">${b.story}</p>
      <div class="pi-basket__build">
        <div class="pi-chip-row" role="group" aria-label="Companies for ${b.title}">
          ${b.tickers
            .map(
              (t) =>
                `<button type="button" class="pi-chip is-selected" data-ticker="${t}" aria-pressed="true">${t}</button>`
            )
            .join("")}
        </div>
        <div class="pi-basket__summary" aria-live="polite">
          <p class="pi-basket__summary-label">Your Basket</p>
          <p class="pi-basket__summary-count" data-selected-count>${stockCountLabel(b.tickers.length)}</p>
          <p class="pi-basket__summary-tickers" data-basket-preview>${initialLine}</p>
        </div>
        <div class="pi-basket__evolve" hidden aria-hidden="true" data-evolve-slot>
          <div class="pi-basket__evolve-owned" data-evolve-owned></div>
          <div class="pi-basket__evolve-add" data-evolve-suggested></div>
        </div>
      </div>
      <p class="pi-basket__risk" data-basket-risk><strong>Risk note.</strong> ${b.risk}</p>
      <div class="pi-basket__actions">
        <button type="button" class="pi-btn pi-btn--ghost" data-open-basket>
          Open Basket
        </button>
        <button type="button" class="pi-btn pi-btn--ghost pi-btn--future" disabled aria-disabled="true" title="Coming soon" data-save-basket>
          Save Basket
        </button>
        <button type="button" class="pi-btn pi-btn--gold" data-continue-broker data-basket-continue data-handoff-label="${b.title}">
          ${CONTINUE_LABEL}
        </button>
        <p class="pi-basket__open-hint" data-open-hint hidden>
          Select at least one company to open this basket.
        </p>
        <p class="pi-basket__continue-hint" data-continue-hint hidden>
          Select at least one company to continue.
        </p>
      </div>
    </article>`;
  }).join("");
}

let mountedRoot = null;
/** @type {HTMLElement|null} */
let activeBasketEl = null;
/** @type {{ label: string, tickers: string[] }} */
let activeExecution = { label: "", tickers: [] };
let selectedBrokerId = null;

function initIntroCard(root) {
  const card = root.querySelector("#piIntro");
  if (!card) return;

  let dismissed = false;
  try {
    dismissed = localStorage.getItem(INTRO_DISMISS_KEY) === "1";
  } catch {
    /* ignore */
  }

  card.hidden = dismissed;
}

function dismissIntroCard(root) {
  const card = root.querySelector("#piIntro");
  if (card) card.hidden = true;
  try {
    localStorage.setItem(INTRO_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

function bindPortfolioInsights(root) {
  if (!root || root.dataset.piMounted === "1") return;
  root.dataset.piMounted = "1";
  mountedRoot = root;

  initIntroCard(root);
  renderBaskets(root);
  renderBrokerIntegrations(root);

  const executionModal = root.querySelector("#piExecutionModal");
  const executionTickers = root.querySelector("#piExecutionTickers");
  const executionBrokers = root.querySelector("#piExecutionBrokers");
  const openBrokerBtn = root.querySelector("#piOpenBrokerBtn");
  const basketReview = root.querySelector("#piBasketReview");
  const basketReviewTitle = root.querySelector("#piBasketReviewTitle");
  const basketReviewTickers = root.querySelector("#piBasketReviewTickers");
  const basketReviewCount = root.querySelector("#piBasketReviewCount");
  const basketReviewRisk = root.querySelector("#piBasketReviewRisk");
  const toast = root.querySelector("#piToast");

  function showToast(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function syncOpenBrokerBtn() {
    if (!openBrokerBtn) return;
    const broker = BROKERS.find((b) => b.id === selectedBrokerId);
    const show = broker?.status === "connected";
    openBrokerBtn.hidden = !show;
    if (show && broker) {
      openBrokerBtn.textContent = `Open ${broker.name}`;
      openBrokerBtn.dataset.brokerUrl = broker.url;
    }
  }

  function closeExecutionModal() {
    setModalOpen(executionModal, false);
    selectedBrokerId = null;
    syncOpenBrokerBtn();
  }

  function closeBasketReview() {
    setModalOpen(basketReview, false);
    activeBasketEl = null;
  }

  function openExecutionModal(label, tickers) {
    if (!executionModal) return;
    const list =
      typeof tickers === "string" ? tickers.split(",").filter(Boolean) : [...tickers];

    closeBasketReview();
    activeExecution = { label, tickers: list };
    selectedBrokerId = null;

    if (executionTickers) {
      executionTickers.textContent = list.length
        ? formatTickerLine(list)
        : "No companies selected";
      executionTickers.classList.toggle("is-empty", list.length === 0);
    }

    renderExecutionBrokers(executionBrokers, null);
    syncOpenBrokerBtn();
    setModalOpen(executionModal, true);
  }

  function openBasketReview(basketEl) {
    if (!basketReview || !basketEl) return;
    const selected = getSelectedTickers(basketEl);
    if (!selected.length) return;

    const title = getBasketTitle(basketEl);
    const def = getBasketDef(basketEl);
    const risk = def?.risk || "";

    activeBasketEl = basketEl;
    closeExecutionModal();

    if (basketReviewTitle) basketReviewTitle.textContent = `${title} Basket`;
    if (basketReviewTickers) {
      basketReviewTickers.textContent = formatTickerLine(selected);
    }
    if (basketReviewCount) {
      basketReviewCount.textContent = stockCountLabel(selected.length);
    }
    if (basketReviewRisk) {
      basketReviewRisk.innerHTML = risk
        ? `<strong>Risk note.</strong> ${risk}`
        : "";
      basketReviewRisk.hidden = !risk;
    }

    setModalOpen(basketReview, true);
  }

  function exportCsv() {
    const { label, tickers } = activeExecution;
    if (!tickers.length) return;
    const header = "Symbol,Basket\n";
    const rows = tickers.map((t) => `${t},${label}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forgeniq-${label.replace(/\s+/g, "-").toLowerCase()}-basket.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Basket exported as CSV");
  }

  async function copyTickerList() {
    const { tickers } = activeExecution;
    if (!tickers.length) return;
    const text = tickers.join(", ");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Ticker list copied");
    } catch {
      showToast(text);
    }
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-pi-intro-dismiss]")) {
      dismissIntroCard(root);
      return;
    }

    const chip = e.target.closest(".pi-chip");
    if (chip && root.contains(chip)) {
      const basketEl = chip.closest(".pi-basket");
      if (!basketEl) return;
      const selected = chip.classList.toggle("is-selected");
      chip.setAttribute("aria-pressed", selected ? "true" : "false");
      updateBasketCard(basketEl);
      return;
    }

    const exec = e.target.closest("[data-continue-broker]");
    if (exec && root.contains(exec)) {
      if (exec.disabled || exec.classList.contains("is-disabled")) return;

      const basketEl = exec.closest(".pi-basket");
      if (basketEl) {
        const selected = getSelectedTickers(basketEl);
        if (!selected.length) return;
        const label = exec.dataset.handoffLabel || getBasketTitle(basketEl);
        openExecutionModal(label, selected);
        return;
      }

      openExecutionModal(
        exec.dataset.handoffLabel || "Portfolio Insights",
        exec.dataset.tickers || "NVDA,AMD,MSFT"
      );
      return;
    }

    const openBtn = e.target.closest("[data-open-basket]");
    if (openBtn && root.contains(openBtn)) {
      if (openBtn.disabled || openBtn.classList.contains("is-disabled")) return;
      const basketEl = openBtn.closest(".pi-basket");
      if (!basketEl) return;
      openBasketReview(basketEl);
      return;
    }

    if (e.target.closest("[data-basket-review-continue]")) {
      if (!activeBasketEl) return;
      const selected = getSelectedTickers(activeBasketEl);
      if (!selected.length) return;
      const label = getBasketTitle(activeBasketEl);
      openExecutionModal(label, selected);
      return;
    }

    if (
      e.target.closest("[data-basket-review-close]") ||
      e.target.classList.contains("pi-basket-review__backdrop")
    ) {
      closeBasketReview();
      return;
    }

    if (
      e.target.closest("[data-execution-close]") ||
      e.target.classList.contains("pi-exec-modal__backdrop")
    ) {
      closeExecutionModal();
      return;
    }

    const brokerPick = e.target.closest("[data-broker-pick]");
    if (brokerPick && executionModal?.contains(brokerPick)) {
      const id = brokerPick.dataset.brokerPick;
      const status = brokerPick.dataset.brokerStatus;
      if (status === "connected") {
        selectedBrokerId = id;
        renderExecutionBrokers(executionBrokers, id);
        syncOpenBrokerBtn();
      } else if (status === "connect") {
        showToast("Broker connection coming soon");
      }
      return;
    }

    if (e.target.closest("[data-export-csv]")) {
      exportCsv();
      return;
    }

    if (e.target.closest("[data-copy-tickers]")) {
      copyTickerList();
      return;
    }

    if (e.target.closest("[data-open-broker]")) {
      const broker = BROKERS.find((b) => b.id === selectedBrokerId);
      if (broker?.status === "connected" && broker.url) {
        window.open(broker.url, "_blank", "noopener,noreferrer");
      }
      return;
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (basketReview?.classList.contains("is-open")) {
      closeBasketReview();
      return;
    }
    if (executionModal?.classList.contains("is-open")) {
      closeExecutionModal();
    }
  });

  const ready = root.querySelector("#piReady");
  const sticky = root.querySelector("#piSticky");
  if (ready && sticky) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.hidden = !past;
        sticky.classList.toggle("is-visible", past);
      },
      { threshold: 0, rootMargin: "0px" }
    );
    observer.observe(ready);
  }
}

export function mountPortfolioInsights() {
  const root = document.getElementById("page-portfolio-insights");
  if (!root) return;
  bindPortfolioInsights(root);
}

window.mountPortfolioInsights = mountPortfolioInsights;
