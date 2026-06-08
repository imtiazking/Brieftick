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

const INTRO_DISMISS_KEY = "bt_pi_intro_dismissed";

function stockCountLabel(n) {
  return `${n} compan${n === 1 ? "y" : "ies"} selected`;
}

function getSelectedTickers(basketEl) {
  return [...basketEl.querySelectorAll(".pi-chip.is-selected")].map(
    (c) => c.dataset.ticker
  );
}

function formatTickerLine(tickers) {
  return tickers.length ? tickers.join(" • ") : "";
}

function updateBasketCard(basketEl) {
  const selected = getSelectedTickers(basketEl);
  const countEl = basketEl.querySelector("[data-selected-count]");
  const previewEl = basketEl.querySelector("[data-basket-preview]");
  const continueBtn = basketEl.querySelector("[data-basket-continue]");
  const hintEl = basketEl.querySelector("[data-continue-hint]");

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
  if (hintEl) {
    hintEl.hidden = !empty;
  }
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
      <p class="pi-basket__risk"><strong>Risk note.</strong> ${b.risk}</p>
      <div class="pi-basket__actions">
        <button type="button" class="pi-btn pi-btn--ghost" data-open-basket>
          Open Basket
        </button>
        <button type="button" class="pi-btn pi-btn--ghost pi-btn--future" disabled aria-disabled="true" title="Coming soon" data-save-basket>
          Save Basket
        </button>
        <button type="button" class="pi-btn pi-btn--gold" data-continue-broker data-basket-continue data-handoff-label="${b.title}">
          Continue with Trading212
        </button>
        <p class="pi-basket__continue-hint" data-continue-hint hidden>
          Select at least one company to continue.
        </p>
      </div>
    </article>`;
  }).join("");
}

let mountedRoot = null;

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

  const handoff = root.querySelector("#piHandoff");
  const handoffTitle = root.querySelector("#piHandoffTitle");
  const handoffBody = root.querySelector("#piHandoffBody");
  const handoffTickers = root.querySelector("#piHandoffTickers");
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

  function openHandoff(label, tickers) {
    if (!handoff) return;
    const list =
      typeof tickers === "string" ? tickers.split(",").filter(Boolean) : tickers;

    if (handoffTitle) handoffTitle.textContent = "Continue with Trading212";
    if (handoffBody) {
      handoffBody.textContent = `Handoff for "${label}". Your broker handles execution — Brieftick does not place orders or hold funds.`;
    }
    if (handoffTickers) {
      handoffTickers.textContent = list.length
        ? formatTickerLine(list)
        : "No companies selected";
      handoffTickers.classList.toggle("is-empty", list.length === 0);
    }

    handoff.classList.add("is-open");
    handoff.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeHandoff() {
    if (!handoff) return;
    handoff.classList.remove("is-open");
    handoff.setAttribute("aria-hidden", "true");
    if (mountedRoot?.classList.contains("active")) {
      document.body.style.overflow = "";
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
        const label =
          exec.dataset.handoffLabel || basketEl.querySelector("h3")?.textContent;
        openHandoff(label, selected);
        return;
      }

      openHandoff(
        exec.dataset.handoffLabel || "Portfolio Insights",
        exec.dataset.tickers || "NVDA,AMD,MSFT"
      );
      return;
    }

    const openBtn = e.target.closest("[data-open-basket]");
    if (openBtn && root.contains(openBtn)) {
      const basketEl = openBtn.closest(".pi-basket");
      if (!basketEl) return;
      const title = basketEl.querySelector("h3")?.textContent || "Basket";
      const selected = getSelectedTickers(basketEl);
      showToast(
        selected.length
          ? `"${title}" · Your Basket: ${formatTickerLine(selected)}`
          : `"${title}" · Your Basket: no companies selected`
      );
      return;
    }

    if (
      e.target.closest("[data-handoff-close]") ||
      e.target.classList.contains("pi-handoff__backdrop")
    ) {
      closeHandoff();
    }
    if (e.target.closest("[data-open-in-broker]")) {
      showToast("Broker handoff simulated. No order routing.");
      closeHandoff();
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && handoff?.classList.contains("is-open")) {
      closeHandoff();
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
