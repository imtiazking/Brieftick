/**
 * Portfolio Intelligence · design-lab prototype only.
 * No auth, API, KYC, payments, or order routing.
 */

const BASKETS = [
  {
    id: "ai",
    title: "AI Infrastructure",
    story: "Data-centre build-out and GPU demand favour chip, networking, and cloud platforms.",
    tickers: ["NVDA", "AMD", "AVGO", "MSFT", "ANET"],
    risk: "Concentrated mega-cap theme exposure. Momentum can reverse on capex or regulation headlines.",
  },
  {
    id: "cyber",
    title: "Cybersecurity",
    story: "Enterprise security spend rises as breaches and compliance pressure intensify.",
    tickers: ["CRWD", "PANW", "ZS", "FTNT"],
    risk: "High valuation multiples. Earnings misses often trigger sharp group drawdowns.",
  },
  {
    id: "energy",
    title: "Energy",
    story: "Producers and infrastructure exposed to supply, demand, and geopolitical shocks.",
    tickers: ["XOM", "CVX", "COP", "SLB"],
    risk: "Commodity-linked volatility. Moves with oil and gas prices, not equity beta alone.",
  },
  {
    id: "health",
    title: "Healthcare",
    story: "Large-cap pharma and devices with defensive characteristics and policy sensitivity.",
    tickers: ["LLY", "UNH", "JNJ", "ABBV"],
    risk: "Regulatory and reimbursement risk. Single trial headlines can dominate returns.",
  },
];

function renderBaskets() {
  const grid = document.getElementById("piBaskets");
  if (!grid) return;

  grid.innerHTML = BASKETS.map(
    (b) => `
    <article class="pi-basket" data-basket="${b.id}">
      <h3>${b.title}</h3>
      <p class="pi-basket__story">${b.story}</p>
      <div class="pi-basket__row">
        <dl class="pi-basket__field">
          <dt>Exposed names</dt>
          <dd class="pi-tickers">${b.tickers.map((t) => `<span class="pi-ticker">${t}</span>`).join("")}</dd>
        </dl>
      </div>
      <p class="pi-basket__risk"><strong>Risk note.</strong> ${b.risk}</p>
      <div class="pi-basket__actions">
        <button type="button" class="pi-btn pi-btn--ghost" data-open-basket="${b.title}" data-tickers="${b.tickers.join(",")}">
          Open Basket
        </button>
        <button type="button" class="pi-btn pi-btn--gold" data-continue-broker data-handoff-label="${b.title}" data-tickers="${b.tickers.join(",")}">
          Continue with Trading212
        </button>
      </div>
    </article>`
  ).join("");
}

function init() {
  renderBaskets();

  const handoff = document.getElementById("piHandoff");
  const handoffTitle = document.getElementById("piHandoffTitle");
  const handoffBody = document.getElementById("piHandoffBody");
  const toast = document.getElementById("piToast");

  function showToast(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  function openHandoff(label, tickers) {
    if (!handoff) return;
    if (handoffTitle) handoffTitle.textContent = "Continue with Trading212";
    if (handoffBody) {
      handoffBody.textContent = `Prototype handoff for "${label}". Execute with your broker — Brieftick does not place orders or hold funds.`;
    }
    handoff.classList.add("is-open");
    handoff.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeHandoff() {
    if (!handoff) return;
    handoff.classList.remove("is-open");
    handoff.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    const exec = e.target.closest("[data-continue-broker]");
    const basket = e.target.closest("[data-open-basket]");

    if (exec) {
      openHandoff(exec.dataset.handoffLabel || "Portfolio Intelligence", exec.dataset.tickers || "NVDA,AMD,MSFT");
      return;
    }
    if (basket) {
      showToast(`Prototype — "${basket.dataset.openBasket}" basket opened in design lab.`);
      return;
    }
    if (e.target.closest("[data-handoff-close]") || e.target.classList.contains("pi-handoff__backdrop")) {
      closeHandoff();
    }
    if (e.target.closest("[data-open-in-broker]")) {
      showToast("Prototype — Open in Trading212 simulated. No order routing.");
      closeHandoff();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && handoff?.classList.contains("is-open")) closeHandoff();
  });

  const ready = document.getElementById("ready");
  const sticky = document.getElementById("piSticky");
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
