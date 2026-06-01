/**
 * Sparkline / chart helpers (from index.html WIM charts).
 * @module preview/ticker-deep-dive/wim-charts
 */

export function genSeries(n = 80, vol = 8, trend = -0.4, seed = 1) {
  let v = 100;
  const a = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280 - 0.5;
    v += r * vol + trend * 0.5;
    a.push(v);
  }
  return a;
}

export function drawChart(el, series, opts = {}) {
  if (!el || !series?.length) return;
  const w = el.clientWidth || 640;
  const h = el.clientHeight || 140;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = 8;
  const span = max - min || 1;
  const xs = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  let path = `M${xs(0)} ${ys(series[0])}`;
  for (let i = 1; i < series.length; i++) path += ` L${xs(i)} ${ys(series[i])}`;
  const fillPath = `${path} L${xs(series.length - 1)} ${h - pad} L${xs(0)} ${h - pad} Z`;
  const color = opts.color || "#ff5b6e";
  const gid = opts.id || "td";
  const grid = Array.from({ length: 4 }, (_, i) => {
    const y = pad + (i / 3) * (h - pad * 2);
    return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="rgba(180,200,255,0.05)" stroke-width="1"/>`;
  }).join("");
  const lastX = xs(series.length - 1);
  const lastY = ys(series[series.length - 1]);
  el.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g_${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${fillPath}" fill="url(#g_${gid})" stroke="none"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="3" fill="${color}"/>
    </svg>`;
}

export function spark(series, color) {
  const w = 60;
  const h = 24;
  const n = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => `${(i / (n - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`)
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
