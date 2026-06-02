export const SESSION = {
  mood: "positive",
  moodLabel: "Positive",
  headline: "Today: tech and energy lead; banks lag.",
  subline: "Investors are betting AI spending continues while rate-cut hopes pressure banks.",
  episodeTitle: "Rotation Day",
  episodeLogline: "Tech wins, banks lose, energy joins late.",
  watch: ["NVDA commentary", "Fed speakers", "Crude close"],
};

export const BEATS = [
  {
    id: "tech",
    verb: "Tech takes the lead",
    why: "AI data-center spend stays in focus.",
    sector: "Technology",
    stocks: [
      { sym: "NVDA", role: "AI leader", pct: 1.98 },
      { sym: "AMD", role: "Chips", pct: 1.12 },
    ],
  },
  {
    id: "energy",
    verb: "Energy firms with oil",
    why: "Crude holds steady; producers catch a bid.",
    sector: "Energy",
    stocks: [
      { sym: "XOM", role: "Oil giant", pct: 1.18 },
      { sym: "CVX", role: "Energy", pct: 0.84 },
    ],
  },
  {
    id: "banks",
    verb: "Banks lag",
    why: "Rate-cut bets pressure margins.",
    sector: "Financials",
    stocks: [{ sym: "JPM", role: "Big bank", pct: -0.41 }],
  },
];

export const DRIVERS = [
  { id: "ai", label: "AI spend", title: "AI spend → Tech", sector: "Technology" },
  { id: "oil", label: "Oil steady", title: "Oil steady → Energy", sector: "Energy" },
  { id: "rates", label: "Rate cuts", title: "Rate cuts → Banks soft", sector: "Financials" },
];

export function openDive(sym, name, context) {
  const el = document.getElementById("expDive");
  if (!el) return;
  document.getElementById("diveSym").textContent = sym;
  document.getElementById("diveName").textContent = name;
  document.getElementById("diveCtx").textContent = context;
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
}

export function mountDive() {
  if (document.getElementById("expDive")) return;
  const aside = document.createElement("aside");
  aside.className = "exp-dive";
  aside.id = "expDive";
  aside.setAttribute("aria-hidden", "true");
  aside.innerHTML = `
    <div class="exp-dive__bg" id="diveBg"></div>
    <div class="exp-dive__panel">
      <button type="button" class="exp-dive__close" id="diveClose" aria-label="Close">×</button>
      <p class="kicker">Deep Dive · Mock</p>
      <h2 id="diveSym">NVDA</h2>
      <p id="diveName">NVIDIA</p>
      <p id="diveCtx" style="margin-top:16px"></p>
      <p style="margin-top:20px;font-family:var(--mono);font-size:9px;color:#4a5568">Design lab · Not connected to app</p>
    </div>`;
  document.body.appendChild(aside);
  const close = () => {
    aside.classList.remove("is-open");
    aside.setAttribute("aria-hidden", "true");
  };
  document.getElementById("diveClose").addEventListener("click", close);
  document.getElementById("diveBg").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
