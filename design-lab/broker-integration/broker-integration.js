/**
 * Design lab · Broker integration prototype (no real API / auth).
 */

const BASKETS = [
  {
    id: "ai",
    icon: "◇",
    title: "AI Infrastructure",
    desc: "Companies building the compute, networking, and cloud layers behind the AI build-out.",
    tickers: ["NVDA", "AMD", "AVGO", "MSFT", "ANET"],
    risk: "Concentrated mega-cap exposure. Theme momentum can reverse quickly on capex or regulation headlines.",
  },
  {
    id: "cyber",
    icon: "◈",
    title: "Cybersecurity",
    desc: "Names tied to enterprise security spend as breaches and compliance pressure rise.",
    tickers: ["CRWD", "PANW", "FTNT", "ZS", "S"],
    risk: "High valuation multiples. Earnings misses often trigger sharp drawdowns in the group.",
  },
  {
    id: "energy",
    icon: "◎",
    title: "Energy",
    desc: "Producers and infrastructure exposed to supply, demand, and geopolitical shocks.",
    tickers: ["XOM", "CVX", "SLB", "EOG", "COP"],
    risk: "Commodity-linked volatility. Basket moves with oil and gas prices, not just equity beta.",
  },
  {
    id: "health",
    icon: "◉",
    title: "Healthcare",
    desc: "Large-cap pharma and devices with defensive characteristics and policy sensitivity.",
    tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK"],
    risk: "Regulatory and reimbursement risk. Single drug or trial headlines can dominate returns.",
  },
];

const STORY = {
  title: "AI Infrastructure",
  body: "Data-centre build-out and GPU demand continue to favour the supply chain — from chip designers to networking and hyperscale platforms.",
  tickers: ["NVDA", "AMD", "AVGO", "MSFT", "ANET"],
};

const handoffEl = document.getElementById("biHandoff");
const handoffTitle = document.getElementById("biHandoffTitle");
const handoffContext = document.getElementById("biHandoffContext");
const handoffNames = document.getElementById("biHandoffNames");

function renderTickers(container, tickers) {
  container.innerHTML = tickers
    .map((t) => `<span class="bi-ticker">${t}</span>`)
    .join("");
}

function renderBaskets() {
  const grid = document.getElementById("biBaskets");
  if (!grid) return;

  grid.innerHTML = BASKETS.map(
    (b) => `
    <article class="bi-basket" data-basket="${b.id}">
      <div class="bi-basket__icon" aria-hidden="true">${b.icon}</div>
      <h3>${b.title}</h3>
      <p class="bi-basket__desc">${b.desc}</p>
      <div class="bi-names">
        <p class="bi-names__label">Exposed names</p>
        <div class="bi-names__row">${b.tickers.map((t) => `<span class="bi-ticker">${t}</span>`).join("")}</div>
      </div>
      <div class="bi-basket__risk">
        <strong>Risk note</strong>
        ${b.risk}
      </div>
      <button type="button" class="bi-btn bi-btn--broker bi-btn--block" data-handoff="${b.title}" data-tickers="${b.tickers.join(",")}">
        Continue to Trading212
      </button>
    </article>`
  ).join("");
}

function openHandoff(label, tickers) {
  if (!handoffEl) return;
  const list = typeof tickers === "string" ? tickers.split(",").filter(Boolean) : tickers;

  if (handoffTitle) handoffTitle.textContent = "Continue to broker";
  if (handoffContext) {
    handoffContext.textContent = `You are leaving FORGENIQ to view "${label}" in Trading212. This is a design prototype — no account linking or orders are placed.`;
  }
  if (handoffNames) renderTickers(handoffNames, list);

  handoffEl.classList.add("is-open");
  handoffEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeHandoff() {
  if (!handoffEl) return;
  handoffEl.classList.remove("is-open");
  handoffEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function bindEvents() {
  document.getElementById("biStoryTickers")?.append(
    ...STORY.tickers.map((t) => {
      const el = document.createElement("span");
      el.className = "bi-ticker";
      el.textContent = t;
      return el;
    })
  );

  document.addEventListener("click", (e) => {
    const handoffBtn = e.target.closest("[data-handoff]");
    if (handoffBtn) {
      openHandoff(handoffBtn.dataset.handoff, handoffBtn.dataset.tickers);
      return;
    }

    if (e.target.closest("[data-handoff-close]") || e.target.classList.contains("bi-handoff__backdrop")) {
      closeHandoff();
      return;
    }

    if (e.target.closest("[data-mock-watchlist]")) {
      const toast = document.getElementById("biToast");
      if (toast) {
        toast.hidden = false;
        toast.textContent = "Prototype only — watchlist not saved.";
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
          toast.hidden = true;
        }, 2200);
      }
    }

    if (e.target.closest("[data-mock-logic]")) {
      const toast = document.getElementById("biToast");
      if (toast) {
        toast.hidden = false;
        toast.textContent = "Prototype only — Logic handoff not wired.";
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
          toast.hidden = true;
        }, 2200);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && handoffEl?.classList.contains("is-open")) closeHandoff();
  });
}

renderBaskets();
bindEvents();
