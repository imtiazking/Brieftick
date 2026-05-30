/**
 * Intelligence Rail — static module mocks (production dashboard parity).
 * @module preview/dashboard-rail-mocks
 */

export const RAIL_PULSE = {
  regime: "Risk-On · Narrow Leadership",
  regimeShort: "Risk-On",
  confidence: "78%",
  narrative:
    "Megacap tech is carrying index returns while breadth only partially confirms. Rates are stable and the dollar is steady — leadership is concentrated, not broad. Institutional flow favours growth ETFs; defensives see tactical outflows.",
  narrativeShort:
    "AI leadership dominant while breadth only partly confirms — index strength remains narrow, not broad.",
  /** Wheel strip — single editorial line (max 2 lines total) */
  editorialLine: "AI Leadership Dominant",
  keyDriver: "AI capex narrative + mega-cap earnings resilience",
  keyRisk: "Treasury yields · CPI event risk · narrow concentration",
  session:
    "NYSE session: indices green on tech leadership; energy firm on supply narrative; financials lag on curve flattening. Watch CPI tomorrow and Powell commentary Wednesday.",
};

export const RAIL_SECTIONS = [
  { id: "movers", label: "MOVERS", code: "01", title: "Top Movers · S&P 500", meta: "↻ 4s · mock" },
  { id: "heatmap", label: "HEATMAP", code: "02", title: "Sector Heatmap", meta: "1D %" },
  { id: "volatility", label: "VOLATILITY", code: "03", title: "Volatility Monitor", meta: "CBOE · prior close" },
  { id: "flows", label: "FLOWS", code: "07", title: "Market Intelligence Engine", meta: "Live capital flow" },
  { id: "signals", label: "SIGNALS", code: "06", title: "Signal Intelligence Feed", meta: "8 headlines · mock" },
  { id: "news", label: "NEWS", code: "10", title: "News Intelligence", meta: "Filtered ↻ 12s" },
  { id: "correlation", label: "CORRELATION", code: "09", title: "Correlation Engine · 30D", meta: "Pearson · static" },
  { id: "alerts", label: "ALERTS", code: "S1", title: "High-Signal Alerts", meta: "CB · Macro · Regulatory" },
  { id: "watchlist", label: "WATCHLIST", code: "05", title: "Watchlist", meta: "Design lab book" },
  { id: "session", label: "SESSION", code: "08", title: "Brieftick · Session Summary", meta: "AI · mock" },
];

/** Plain-English wheel navigation labels (wheel only; module ids/engines unchanged) */
const WHEEL_LABELS = {
  movers: "Movers",
  heatmap: "Sectors",
  volatility: "Market Risk",
  flows: "Money Flow",
  signals: "Opportunities",
  news: "News",
  correlation: "Relationships",
  alerts: "What Matters",
  watchlist: "Watchlist",
  session: "Summary",
};

/** Wheel channel order — same ids as RAIL_SECTIONS, investor-friendly labels */
export const WHEEL_SECTIONS = RAIL_SECTIONS.map((s) => ({
  ...s,
  label: WHEEL_LABELS[s.id] ?? s.label,
}));

const MOVERS = [
  ["NVDA", "NVIDIA", "219.46", "+1.98", 1.98],
  ["AMD", "Adv. Micro Dev.", "164.28", "−3.44", -3.44],
  ["XOM", "Exxon Mobil", "118.62", "+1.18", 1.18],
  ["META", "Meta Platforms", "568.42", "−0.84", -0.84],
  ["TSLA", "Tesla", "184.92", "−1.42", -1.42],
  ["JPM", "JPMorgan", "204.18", "+0.74", 0.74],
  ["CVX", "Chevron", "162.40", "+0.96", 0.96],
  ["AAPL", "Apple", "219.84", "+0.22", 0.22],
  ["MSFT", "Microsoft", "412.74", "−0.53", -0.53],
  ["AVGO", "Broadcom", "1386.20", "−1.18", -1.18],
];

const SECTORS = [
  ["Tech", "+0.42%", 0.42],
  ["Energy", "+1.18%", 1.18],
  ["Financials", "+0.36%", 0.36],
  ["Healthcare", "−0.18%", -0.18],
  ["Consumer Discr.", "−0.44%", -0.44],
  ["Industrials", "+0.21%", 0.21],
  ["Utilities", "+0.63%", 0.63],
  ["Materials", "−0.12%", -0.12],
  ["Comm Services", "−0.28%", -0.28],
  ["Real Estate", "+0.08%", 0.08],
  ["Staples", "+0.31%", 0.31],
  ["Semis", "−1.36%", -1.36],
];

const CORR_SYMS = ["NVDA", "AMD", "AVGO", "MSFT", "META", "SPY"];
const CORR_MATRIX = [
  [1.0, 0.86, 0.78, 0.62, 0.58, 0.71],
  [0.86, 1.0, 0.74, 0.54, 0.51, 0.66],
  [0.78, 0.74, 1.0, 0.51, 0.49, 0.61],
  [0.62, 0.54, 0.51, 1.0, 0.68, 0.78],
  [0.58, 0.51, 0.49, 0.68, 1.0, 0.74],
  [0.71, 0.66, 0.61, 0.78, 0.74, 1.0],
];

const WATCHLIST = [
  ["NVDA", "NVIDIA", "219.46", "+1.98"],
  ["MSFT", "Microsoft", "412.74", "−0.53"],
  ["AMD", "AMD", "164.28", "−3.44"],
  ["AAPL", "Apple", "219.84", "+0.22"],
  ["TSLA", "Tesla", "184.92", "−1.42"],
  ["META", "Meta", "568.42", "−0.84"],
];

const SIGNALS = [
  { ago: "12m", text: "<b>Fed speakers</b> lean slightly hawkish; front-end yields tick higher.", tags: ["macro", "bearish"] },
  { ago: "28m", text: "Unusual <b>call activity</b> in NVDA ahead of earnings — vol above 30d mean.", tags: ["tech", "bullish"] },
  { ago: "41m", text: "Small-cap breadth diverges: <b>IWM</b> lags SPY despite risk-on index tone.", tags: ["neutral"] },
  { ago: "1h", text: "<b>OPEC</b> commentary supports crude; energy complex bid.", tags: ["energy", "bullish"] },
  { ago: "1h", text: "Dollar–gold <b>correlation breakdown</b> intraday — macro desks flag.", tags: ["macro"] },
  { ago: "2h", text: "<b>NVDA</b> dark-pool prints show buyers defending on dips.", tags: ["tech", "bullish"] },
];

const NEWS = [
  ["14m", "<b>CPI preview:</b> economists expect core stickiness; markets price 2–3bp front-end move.", ["macro"]],
  ["32m", "<b>NVDA</b> supplier commentary supports AI capex narrative into earnings.", ["tech", "bullish"]],
  ["48m", "European PMIs soften; <b>DAX</b> lags US futures.", ["macro", "bearish"]],
  ["1h", "<b>JPM</b> notes buyback support in mega-cap financials.", ["bullish"]],
  ["1h", "Geopolitical headlines <b>muted</b>; oil steady near range highs.", ["energy", "neutral"]],
  ["2h", "<b>Fed</b> balance-sheet debate resurfaces in op-ed cycle.", ["macro"]],
];

const ALERTS = [
  { type: "Central Bank", headline: "Fed speaker stack this week — front-end sensitive", read: "Multiple governors on circuit; markets anchor on inflation progress narrative." },
  { type: "Macro", headline: "CPI tomorrow · consensus core 0.2% m/m", read: "Event risk elevated; vol markets price modest upside surprise risk." },
  { type: "Regulatory", headline: "SEC comment period on market structure reform", read: "Desk focus low near-term; watch for exchange fee narrative." },
  { type: "Geopolitical", headline: "Energy supply commentary from OPEC+", read: "Supports crude bid; inflation pass-through risk for goods." },
];

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heatColor(v) {
  const a = Math.min(Math.abs(v) / 3, 1);
  if (v >= 0.1) return `rgba(61,220,151, ${0.15 + a * 0.7})`;
  if (v <= -0.1) return `rgba(255,91,110, ${0.15 + a * 0.7})`;
  return "rgba(255,255,255,0.04)";
}

function corrColor(v) {
  if (v >= 0.8) return "rgba(255,91,110,0.55)";
  if (v >= 0.65) return "rgba(255,91,110,0.32)";
  if (v >= 0.5) return "rgba(255,181,71,0.32)";
  if (v >= 0.3) return "rgba(78,168,255,0.25)";
  return "rgba(78,168,255,0.12)";
}

function sparkPath(seed) {
  const pts = [];
  let v = 50;
  for (let i = 0; i < 12; i++) {
    v += (seed % 7) - 3 + (i % 3) - 1;
    v = Math.max(8, Math.min(92, v));
    pts.push(v);
    seed += 1;
  }
  const w = 56;
  const h = 22;
  return pts
    .map((y, i) => `${(i / (pts.length - 1)) * w},${h - (y / 100) * (h - 2) - 1}`)
    .join(" ");
}

function moduleHead(section) {
  return `<header class="rail-module__head">
    <span class="rail-module__title"><b>${esc(section.code)}</b> ${esc(section.title)}</span>
    <span class="rail-module__meta">${esc(section.meta)}</span>
  </header>`;
}

function renderMovers(section) {
  const rows = MOVERS.map(([s, n, p, c, d]) => {
    const cls = d > 0 ? "up" : d < 0 ? "dn" : "flat";
    const color = d > 0 ? "#3ddc97" : d < 0 ? "#ff5b6e" : "#5a6577";
    return `<div class="mover">
      <div class="sym">${esc(s)}</div>
      <div class="name">${esc(n)}</div>
      <svg class="spark" viewBox="0 0 56 22" preserveAspectRatio="none"><polyline points="${sparkPath(d * 3 + s.length)}" fill="none" stroke="${color}" stroke-width="1.4"/></svg>
      <div class="price">${esc(p)}</div>
      <div class="chg ${cls}">${esc(c)}%</div>
    </div>`;
  }).join("");
  return `<div class="rail-module">${moduleHead(section)}${rows}</div>`;
}

function renderHeatmap(section) {
  const cells = SECTORS.map(
    ([n, p, v]) =>
      `<div class="heat-cell" style="background:${heatColor(v)}">
        <div class="sec">${esc(n)}</div>
        <div class="pct">${esc(p)}</div>
      </div>`
  ).join("");
  return `<div class="rail-module">${moduleHead(section)}<div class="heatmap">${cells}</div></div>`;
}

function renderVolatility(section) {
  const vix = 14.2;
  const gauge = `<svg class="gauge" viewBox="0 0 200 110" aria-hidden="true">
    <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
    <line x1="100" y1="100" x2="118" y2="42" stroke="#e8c178" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="5" fill="#0a0d14" stroke="#d4a85a" stroke-width="2"/>
  </svg>`;
  return `<div class="rail-module">${moduleHead(section)}
    <div class="gauge-wrap">${gauge}
      <div class="gauge-value">${vix.toFixed(1)}</div>
      <div class="gauge-state">NORMAL</div>
    </div>
    <div class="vix-explain">
      <div class="vix-explain__label">BriefTick read</div>
      Volatility sits in a constructive band for equities. Event risk is priced into the front week (CPI, Fed speakers) but spot VIX does not signal panic. Skew is modestly elevated — dealers hedging earnings cluster.
    </div>
  </div>`;
}

function renderFlows(section) {
  return `<div class="rail-module">${moduleHead(section)}
    <div class="flow-stats-row">
      <div class="flow-stat"><div class="flow-stat-label">Capital Flow</div><div class="flow-stat-val up">+$12.4B</div><div class="flow-stat-sub">Today · Net inflow</div></div>
      <div class="flow-stat"><div class="flow-stat-label">Risk Appetite</div><div class="flow-stat-val gold">62 / 100</div><div class="flow-stat-sub">Moderate Risk-On</div></div>
      <div class="flow-stat"><div class="flow-stat-label">Market Regime</div><div class="flow-stat-val gold">EXPANSION</div><div class="flow-stat-sub">Early Cycle</div></div>
      <div class="flow-stat"><div class="flow-stat-label">Volatility</div><div class="flow-stat-val">14.2</div><div class="flow-stat-sub">VIX · Normal</div></div>
    </div>
    <div class="flow-grid">
      <div class="flow-col">
        <div class="flow-node"><span>Institutions</span><span class="up">+$4.8B</span></div>
        <div class="flow-node"><span>Retail</span><span class="up">+$2.1B</span></div>
        <div class="flow-node"><span>Hedge Funds</span><span class="up">+$3.2B</span></div>
        <div class="flow-node"><span>ETF Flows</span><span class="up">+$3.3B</span></div>
      </div>
      <div class="flow-center">Flow Engine</div>
      <div class="flow-col">
        <div class="flow-node"><span>Technology</span><span class="up">+$5.6B</span></div>
        <div class="flow-node"><span>Energy</span><span class="up">+$3.2B</span></div>
        <div class="flow-node"><span>Financials</span><span class="up">+$1.8B</span></div>
        <div class="flow-node"><span>Consumer Def.</span><span class="dn">−$1.8B</span></div>
      </div>
    </div>
    <p class="rail-module__meta" style="margin-bottom:12px">Global Market Intelligence · regional snapshot</p>
    <div class="global-grid">
      <div class="global-region"><div class="global-region__label">US Equities</div><div class="global-region__val dn">−0.12%</div><div class="global-region__sub">Momentum mixed</div></div>
      <div class="global-region"><div class="global-region__label">Europe</div><div class="global-region__val">+0.08%</div><div class="global-region__sub">Defensive rotation</div></div>
      <div class="global-region"><div class="global-region__label">Commodities</div><div class="global-region__val up">+0.64%</div><div class="global-region__sub">Energy bid</div></div>
      <div class="global-region"><div class="global-region__label">Asia Pacific</div><div class="global-region__val up">+0.22%</div><div class="global-region__sub">FX stabilising</div></div>
    </div>
    <div class="flow-narr-grid">
      <div class="flow-narr"><div class="flow-narr-tag" style="color:#3ddc97">↑ Risk-On Rotation</div><div class="flow-narr-title">Growth leadership</div><div class="flow-narr-body">Capital rotating into tech and semis with earnings momentum.</div></div>
      <div class="flow-narr"><div class="flow-narr-tag" style="color:#ffb547">~ Yield Pressure</div><div class="flow-narr-title">Curve dynamics</div><div class="flow-narr-body">Rising front-end yields press long-duration assets selectively.</div></div>
    </div>
  </div>`;
}

function renderSignals(section) {
  const items = SIGNALS.map(
    ({ ago, text, tags }) =>
      `<div class="feed-item">
        <div class="feed-time">${esc(ago)}</div>
        <div class="feed-content">
          <div class="lead">${text}</div>
          <div class="tags">${tags.map((t) => `<span class="tag ${esc(t)}">${esc(t)}</span>`).join("")}</div>
        </div>
      </div>`
  ).join("");
  return `<div class="rail-module">${moduleHead(section)}${items}</div>`;
}

function renderNews(section) {
  const items = NEWS.map(
    ([t, txt, tags]) =>
      `<div class="feed-item">
        <div class="feed-time">${esc(t)}</div>
        <div class="feed-content">
          <div class="lead">${txt}</div>
          <div class="tags">${tags.map((tag) => `<span class="tag ${esc(tag)}">${esc(tag)}</span>`).join("")}</div>
        </div>
      </div>`
  ).join("");
  return `<div class="rail-module">${moduleHead(section)}${items}</div>`;
}

function renderCorrelation(section) {
  let grid = '<div class="corr-grid"><div class="corr-cell label"></div>';
  grid += CORR_SYMS.map((s) => `<div class="corr-cell label">${esc(s)}</div>`).join("");
  CORR_MATRIX.forEach((row, i) => {
    grid += `<div class="corr-cell label">${esc(CORR_SYMS[i])}</div>`;
    row.forEach((v) => {
      grid += `<div class="corr-cell" style="background:${corrColor(v)}">${v.toFixed(2)}</div>`;
    });
  });
  grid += "</div>";
  const note =
    "Pearson 30D · mock snapshot. Highest pair: NVDA/AMD at 0.86, <b style='color:#ffb547'>elevated</b> co-movement. Tech complex remains highly correlated — diversification benefit limited within semis.";
  return `<div class="rail-module">${moduleHead(section)}${grid}<div class="corr-note">${note}</div></div>`;
}

function renderAlerts(section) {
  const items = ALERTS.map(
    (a) =>
      `<div class="alert-item">
        <div class="alert-type">${esc(a.type)}</div>
        <div class="alert-headline">${esc(a.headline)}</div>
        <div class="alert-read">${esc(a.read)}</div>
      </div>`
  ).join("");
  return `<div class="rail-module">${moduleHead(section)}${items}
    <p class="rail-module__meta" style="margin-top:16px">Risk Regime · <b style="color:#d4a85a">04</b> surfaced in Market Pulse hero</p>
  </div>`;
}

function renderWatchlist(section) {
  const rows = WATCHLIST.map(([s, n, p, c]) => {
    const cls = c.startsWith("+") ? "up" : "dn";
    return `<div class="watch-row">
      <div class="sym">${esc(s)}</div>
      <div class="name">${esc(n)}</div>
      <div class="price">${esc(p)}</div>
      <div class="chg ${cls}">${esc(c)}%</div>
    </div>`;
  }).join("");
  return `<div class="rail-module">${moduleHead(section)}${rows}
    <p class="intel-surface__note" style="margin-top:14px">Session Summary · <b style="color:#d4a85a">08</b> in Market Pulse footer</p>
  </div>`;
}

function renderRisk(section) {
  return `<div class="rail-module">${moduleHead({ ...section, code: "04", title: "Risk Regime", meta: "Heuristic · mock" })}
    <div class="risk-bar"><div class="risk-needle" style="left:62%"></div></div>
    <div class="risk-labels"><span>Risk-On</span><span>Neutral</span><span>Risk-Off</span></div>
    <div class="risk-state">MODERATE RISK-ON</div>
    <div class="risk-components">
      <div class="risk-component"><span>Volatility</span><div class="risk-component-track"><div class="risk-component-fill" style="width:38%"></div></div><span>38</span></div>
      <div class="risk-component"><span>Momentum</span><div class="risk-component-track"><div class="risk-component-fill" style="width:68%"></div></div><span>68</span></div>
      <div class="risk-component"><span>Sectors</span><div class="risk-component-track"><div class="risk-component-fill" style="width:55%"></div></div><span>55</span></div>
      <div class="risk-component"><span>News Stress</span><div class="risk-component-track"><div class="risk-component-fill" style="width:42%"></div></div><span>42</span></div>
    </div>
    <div class="vix-explain" style="margin-top:14px"><b style="color:#d4a85a">BriefTick read:</b> Equities hold firm while vol markets price event risk. Credit spreads calm; front-end yields anchor the tape. Primary risk is breadth, not level.</div>
  </div>`;
}

function renderSession(section) {
  return `<div class="rail-module">${moduleHead({ ...section, code: "08", title: "Brieftick · Session Summary", meta: "AI · mock" })}
    <div class="session-body">
      <p>${esc(RAIL_PULSE.session)}</p>
      <p>Cross-asset: dollar steady, gold firm, crude supported. Rates market prices two cuts by year-end with CPI as the next catalyst.</p>
      <p>Desk positioning: long gamma in mega-cap tech, underweight defensives tactically. Watch NVDA earnings and Powell Wednesday.</p>
    </div>
  </div>`;
}

const RENDERERS = {
  movers: renderMovers,
  heatmap: renderHeatmap,
  volatility: renderVolatility,
  flows: renderFlows,
  signals: renderSignals,
  news: renderNews,
  correlation: renderCorrelation,
  alerts: renderAlerts,
  watchlist: renderWatchlist,
  risk: renderRisk,
  session: renderSession,
};

export function renderRailModule(id) {
  const section = WHEEL_SECTIONS.find((s) => s.id === id);
  if (!section) return "";
  const fn = RENDERERS[id];
  return fn ? fn(section) : "";
}

export function renderRailPulseHero() {
  const p = RAIL_PULSE;
  return `
    <span class="rail-pulse__tag">Market Pulse</span>
    <div class="rail-pulse__regime-row">
      <span class="rail-pulse__regime">${esc(p.regime)}</span>
      <span class="rail-pulse__confidence">Confidence ${esc(p.confidence)}</span>
    </div>
    <p class="rail-pulse__narrative">${esc(p.narrative)}</p>
    <div class="rail-pulse__drivers">
      <div class="rail-pulse__driver">
        <span class="rail-pulse__driver-label">Key driver</span>
        <p>${esc(p.keyDriver)}</p>
      </div>
      <div class="rail-pulse__driver rail-pulse__driver--risk">
        <span class="rail-pulse__driver-label">Key risk</span>
        <p>${esc(p.keyRisk)}</p>
      </div>
    </div>
    <footer class="rail-pulse__session">
      <span class="rail-pulse__session-label">Session Summary</span>
      <p>${esc(p.session)}</p>
    </footer>`;
}

export function renderWheelPulseStrip() {
  const p = RAIL_PULSE;
  const line =
    p.editorialLine || p.regimeShort || p.regime.split("·")[0].trim();
  return `
    <span class="wheel-pulse-strip__tag">Market Pulse</span>
    <p class="wheel-pulse-strip__headline">${esc(line)}</p>`;
}
