/**
 * Design lab · Broker Intelligence — shared prototype utilities.
 * No real auth, API, KYC, payments, or order routing.
 */

export const BASKETS = {
  ai: {
    title: "AI Infrastructure",
    tickers: ["NVDA", "AMD", "AVGO", "MSFT", "ANET"],
    risk: "Concentrated mega-cap theme exposure. Momentum can reverse on capex or regulation headlines.",
  },
  cyber: {
    title: "Cybersecurity",
    tickers: ["CRWD", "PANW", "ZS", "FTNT"],
    risk: "High valuation multiples. Earnings misses often trigger sharp group drawdowns.",
  },
  energy: {
    title: "Energy",
    tickers: ["XOM", "CVX", "COP", "SLB"],
    risk: "Commodity-linked volatility. Moves with oil and gas prices, not equity beta alone.",
  },
  health: {
    title: "Healthcare",
    tickers: ["LLY", "UNH", "JNJ", "ABBV"],
    risk: "Policy and reimbursement sensitivity. Single trial headlines can dominate returns.",
  },
};

export function initShared() {
  const handoff = document.getElementById("biHandoff");
  const handoffTitle = document.getElementById("biHandoffTitle");
  const handoffBody = document.getElementById("biHandoffBody");
  const handoffTickers = document.getElementById("biHandoffTickers");
  const toast = document.getElementById("biToast");

  function showToast(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function openHandoff(label, tickers) {
    if (!handoff) return;
    const list = typeof tickers === "string" ? tickers.split(",").filter(Boolean) : tickers;
    if (handoffTitle) handoffTitle.textContent = "Continue with Trading212";
    if (handoffBody) {
      handoffBody.textContent = `Prototype handoff for "${label}". No account linking, KYC, or orders occur.`;
    }
    if (handoffTickers) {
      handoffTickers.innerHTML = list.map((t) => `<span class="bi-ticker">${t}</span>`).join("");
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
    const btn = e.target.closest("[data-handoff]");
    if (btn) {
      openHandoff(btn.dataset.handoff, btn.dataset.tickers);
      return;
    }
    if (e.target.closest("[data-handoff-close]") || e.target.classList.contains("bi-handoff__backdrop")) {
      closeHandoff();
    }
    if (e.target.closest("[data-proto-toast]")) {
      const kind = e.target.closest("[data-proto-toast]").dataset.protoToast;
      const msgs = {
        watchlist: "Prototype only — watchlist not saved.",
        logic: "Prototype only — Logic handoff not wired.",
        basket: "Prototype only — basket created in design lab.",
        analyze: "Prototype only — portfolio analysis not connected.",
      };
      showToast(msgs[kind] || "Prototype only.");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && handoff?.classList.contains("is-open")) closeHandoff();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initShared);
} else {
  initShared();
}
