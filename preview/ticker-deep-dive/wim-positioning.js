/**
 * Market positioning bars (deterministic per symbol for preview).
 * @module preview/ticker-deep-dive/wim-positioning
 */

function hashSym(sym) {
  return String(sym)
    .split("")
    .reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
}

/**
 * @param {string} sym
 */
export function getPositioningForSymbol(sym) {
  const h = Math.abs(hashSym(sym));
  const inst = 45 + (h % 40);
  const retail = 35 + ((h >> 4) % 35);
  const short = 8 + ((h >> 8) % 25);
  const iv = 50 + ((h >> 12) % 40);
  const skew = 40 + ((h >> 16) % 45);
  const retailLabel =
    retail > 60 ? "Bullish · elevated" : retail > 45 ? "Bullish · cooling" : "Neutral";
  const shortLabel = short < 15 ? `${(short / 10).toFixed(1)}% · low` : `${(short / 10).toFixed(1)}% · moderate`;
  const ivLabel = `${iv}th pct · ${iv > 70 ? "elevated" : iv > 50 ? "normal" : "subdued"}`;
  const skewLabel = skew > 55 ? "Put-skewed" : skew < 45 ? "Call-skewed" : "Balanced";
  const volNote =
    iv > 70
      ? "realised vol is rising faster than implied - historically a precursor to wider intraday ranges over the next 3–5 sessions."
      : "implied vol is contained relative to recent realised moves - range expansion less likely near-term.";
  return {
    bars: [
      { label: "Institutional positioning", value: `${inst}th percentile`, width: inst },
      { label: "Retail sentiment", value: retailLabel, width: retail, tone: "blue" },
      { label: "Short interest", value: shortLabel, width: short },
      { label: "Implied volatility (rank)", value: ivLabel, width: iv, tone: "red" },
      { label: "Options skew", value: skewLabel, width: skew, tone: "red" },
    ],
    volNote,
  };
}

/**
 * @param {HTMLElement} host
 * @param {string} sym
 */
export function renderPositioningPanel(host, sym) {
  const { bars, volNote } = getPositioningForSymbol(sym);
  host.innerHTML = `
    <div class="tdd-positioning pos-card">
      ${bars
        .map(
          (b) => `<div class="pos-bar">
        <div class="top"><span>${b.label}</span><b>${b.value}</b></div>
        <div class="pos-track"><div class="pos-fill${b.tone ? ` ${b.tone}` : ""}" style="width:${b.width}%"></div></div>
      </div>`
        )
        .join("")}
      <div class="tdd-positioning__note">
        <b>Volatility implication:</b> ${volNote}
      </div>
    </div>`;
}
