/** Design-lab mock — stocks that move together (30D Pearson proxies) */

export const LAB_NOTE =
  "Illustrative correlation session · design exploration only · not live matrix";

export const STOCKS = [
  { sym: "NVDA", name: "NVIDIA", sector: "ai", hue: 42 },
  { sym: "AMD", name: "AMD", sector: "ai", hue: 48 },
  { sym: "AVGO", name: "Broadcom", sector: "ai", hue: 38 },
  { sym: "MSFT", name: "Microsoft", sector: "ai", hue: 52 },
  { sym: "META", name: "Meta", sector: "ai", hue: 55 },
  { sym: "GOOGL", name: "Alphabet", sector: "ai", hue: 50 },
  { sym: "AAPL", name: "Apple", sector: "ai", hue: 44 },
  { sym: "AMZN", name: "Amazon", sector: "ai", hue: 46 },
  { sym: "TSLA", name: "Tesla", sector: "ai", hue: 35 },
  { sym: "JPM", name: "JPMorgan", sector: "banks", hue: 165 },
  { sym: "BAC", name: "Bank of America", sector: "banks", hue: 158 },
  { sym: "XOM", name: "Exxon Mobil", sector: "energy", hue: 28 },
  { sym: "CVX", name: "Chevron", sector: "energy", hue: 32 },
  { sym: "XLV", name: "Health Care ETF", sector: "health", hue: 130 },
  { sym: "SPY", name: "S&P 500 ETF", sector: "market", hue: 210 },
];

/** @type {{ a: string, b: string, r: number }[]} */
export const EDGES = [
  { a: "NVDA", b: "AMD", r: 0.84 },
  { a: "NVDA", b: "AVGO", r: 0.79 },
  { a: "NVDA", b: "MSFT", r: 0.72 },
  { a: "AMD", b: "AVGO", r: 0.81 },
  { a: "MSFT", b: "GOOGL", r: 0.68 },
  { a: "MSFT", b: "META", r: 0.71 },
  { a: "META", b: "GOOGL", r: 0.76 },
  { a: "AAPL", b: "MSFT", r: 0.65 },
  { a: "AMZN", b: "MSFT", r: 0.62 },
  { a: "TSLA", b: "AMD", r: 0.58 },
  { a: "JPM", b: "BAC", r: 0.88 },
  { a: "JPM", b: "SPY", r: 0.61 },
  { a: "BAC", b: "SPY", r: 0.59 },
  { a: "XOM", b: "CVX", r: 0.91 },
  { a: "XOM", b: "SPY", r: 0.52 },
  { a: "XLV", b: "SPY", r: 0.48 },
  { a: "NVDA", b: "SPY", r: 0.55 },
  { a: "GOOGL", b: "AMZN", r: 0.64 },
  { a: "AVGO", b: "META", r: 0.67 },
  { a: "TSLA", b: "NVDA", r: 0.54 },
];

export const CLUSTERS = [
  { id: "ai", label: "AI & Technology", color: "#e8c98a", accent: "#8eb4ff" },
  { id: "banks", label: "Banks", color: "#6ee7b8", accent: "#3ecf8e" },
  { id: "energy", label: "Energy", color: "#e8b86a", accent: "#d4a85a" },
  { id: "health", label: "Healthcare", color: "#9ed4ff", accent: "#7cc4ff" },
  { id: "market", label: "Broad Market", color: "#b8c0d0", accent: "#9aa6bd" },
];

const ALIASES = {
  GOOGL: "Google",
  AMZN: "Amazon",
  META: "Meta",
  NVDA: "NVIDIA",
  AVGO: "Broadcom",
  BAC: "Bank of America",
  JPM: "JPMorgan",
};

export function stock(sym) {
  return STOCKS.find((s) => s.sym === sym);
}

export function displayName(sym) {
  return ALIASES[sym] || stock(sym)?.name || sym;
}

export function edgesFor(sym, minR = 0.5) {
  return EDGES.filter((e) => (e.a === sym || e.b === sym) && e.r >= minR).sort((x, y) => y.r - x.r);
}

export function other(sym, edge) {
  return edge.a === sym ? edge.b : edge.a;
}

export function strengthLabel(r) {
  if (r >= 0.8) return "move in near-lockstep";
  if (r >= 0.65) return "often rise and fall together";
  if (r >= 0.5) return "tend to drift the same way";
  return "only loosely linked";
}

export function narrateLink(a, b, r) {
  const sa = displayName(a);
  const sb = displayName(b);
  return `${sa} and ${sb} ${strengthLabel(r)}. When one catches a bid, the other usually feels it within the same session.`;
}

export function narrateFocus(sym) {
  const s = stock(sym);
  const links = edgesFor(sym, 0.6).slice(0, 3);
  if (!links.length) {
    return `${displayName(sym)} sits more independently in this mock session — fewer nearby relatives on the strand.`;
  }
  const names = links.map((e) => displayName(other(sym, e)));
  const cluster = CLUSTERS.find((c) => c.id === s?.sector)?.label || "themed";
  return `Closest relatives include ${names.join(", ")}. Together they form a ${cluster.toLowerCase()} field that often moves as one.`;
}

export function mountChrome(title, num) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<header class="mt-lab">
      <strong>${num} · ${title}</strong>
      <nav><a href="/design-lab/move-together">All concepts</a></nav>
    </header>`
  );
}
