/** Design-lab mock session — shared across market-intel concepts */
export const SESSION = {
  mood: "Positive",
  moodClass: "up",
  summary: "Markets are higher as AI demand lifts tech; energy firms with oil; banks lag on rate-cut bets.",
  watch: ["NVDA supply commentary", "Fed speakers", "Crude weekly close"],
};

export const DRIVERS = [
  {
    id: "ai",
    label: "AI capex",
    title: "AI demand lifts tech",
    cause: "Hyperscaler spend",
    sector: "Technology",
    stocks: [{ sym: "NVDA", pct: 1.98 }, { sym: "AMD", pct: 1.12 }],
    reaction: "Semis outperform S&P",
  },
  {
    id: "energy",
    label: "Oil steady",
    title: "Energy firms",
    cause: "Crude holds range",
    sector: "Energy",
    stocks: [{ sym: "XOM", pct: 1.18 }, { sym: "CVX", pct: 0.84 }],
    reaction: "Producers bid",
  },
  {
    id: "banks",
    label: "Rates",
    title: "Banks under pressure",
    cause: "Cut expectations",
    sector: "Financials",
    stocks: [{ sym: "JPM", pct: -0.41 }],
    reaction: "Rotation out of banks",
  },
];

export function mountHero(root, conceptName) {
  const el = document.getElementById(root);
  if (!el) return;
  el.innerHTML = `
    <h1>${conceptName}</h1>
    <p class="summary">${SESSION.summary}</p>
    <div class="meta">
      <span class="intel-mood intel-mood--${SESSION.moodClass}">${SESSION.mood}</span>
      <span class="intel-watch"><b>Watch next:</b> ${SESSION.watch.join(" · ")}</span>
    </div>`;
}
