import {
  STOCKS,
  EDGES,
  mountChrome,
  mountNarrative,
  narrateLink,
  LAB_NOTE,
  stock,
} from "/design-lab/move-together/_together-mock.js";

mountChrome("Neural Intelligence Network", "02");
const narrative = mountNarrative("narrative");

const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.className = "mt-canvas";
stage.appendChild(canvas);
const ctx = canvas.getContext("2d");

document.body.insertAdjacentHTML(
  "beforeend",
  `<div class="neural-ui glass" id="neuralUi">
    <button type="button" id="pulseNvda">Pulse NVDA</button>
    <span>Watch influence travel</span>
  </div><p class="mt-badge">${LAB_NOTE}</p>`
);

const style = document.createElement("style");
style.textContent = `
  .neural-ui {
    position: fixed; top: 64px; right: 24px; z-index: 100;
    padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;
  }
  .neural-ui button {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
    padding: 10px 14px; border-radius: 8px; border: 1px solid var(--gold-dim);
    background: rgba(212,168,90,0.12); color: var(--gold); cursor: pointer;
  }
  .neural-ui span { font-size: 11px; color: var(--muted); }
`;
document.head.appendChild(style);

const layout = new Map([
  ["NVDA", { x: 0.5, y: 0.28 }],
  ["AMD", { x: 0.32, y: 0.42 }],
  ["AVGO", { x: 0.68, y: 0.42 }],
  ["MSFT", { x: 0.5, y: 0.58 }],
  ["META", { x: 0.22, y: 0.58 }],
  ["GOOGL", { x: 0.78, y: 0.58 }],
  ["AAPL", { x: 0.15, y: 0.72 }],
  ["AMZN", { x: 0.85, y: 0.72 }],
  ["TSLA", { x: 0.38, y: 0.72 }],
  ["JPM", { x: 0.12, y: 0.38 }],
  ["BAC", { x: 0.08, y: 0.52 }],
  ["XOM", { x: 0.88, y: 0.32 }],
  ["CVX", { x: 0.92, y: 0.48 }],
  ["XLV", { x: 0.72, y: 0.82 }],
  ["SPY", { x: 0.5, y: 0.88 }],
]);

const nodes = STOCKS.filter((s) => layout.has(s.sym)).map((s) => ({
  ...s,
  ...layout.get(s.sym),
  glow: 0,
  ring: 0,
}));

const edges = EDGES.filter((e) => layout.has(e.a) && layout.has(e.b));

/** @type {{ path: string[], t: number, edge: object }[]} */
let pulses = [];

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = innerWidth;
  const h = innerHeight - 48;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function pos(n, w, h) {
  return { x: n.x * w, y: n.y * h };
}

function firePulse(from = "NVDA") {
  const chain = [
    ["NVDA", "AMD"],
    ["AMD", "AVGO"],
    ["AVGO", "MSFT"],
    ["NVDA", "MSFT"],
    ["MSFT", "META"],
    ["MSFT", "GOOGL"],
  ];
  let delay = 0;
  chain.forEach(([a, b]) => {
    const edge = edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    if (!edge) return;
    setTimeout(() => {
      pulses.push({ edge, t: 0 });
      nodes.forEach((n) => {
        if (n.sym === a || n.sym === b) n.glow = 1;
      });
      narrative.set(
        b,
        `Signal leaving ${stock(a)?.name || a} → ${stock(b)?.name || b}. ${narrateLink(a, b, edge.r)}`
      );
    }, delay);
    delay += 520;
  });
}

document.getElementById("pulseNvda")?.addEventListener("click", () => firePulse());
setTimeout(() => firePulse(), 800);

let hover = null;
canvas.addEventListener("pointermove", (e) => {
  const { w, h } = resize();
  hover = null;
  for (const n of nodes) {
    const p = pos(n, w, h);
    const dx = e.clientX - p.x;
    const dy = e.clientY - 48 - p.y;
    if (dx * dx + dy * dy < 900) hover = n.sym;
  }
  if (hover) narrative.set(hover, `Neuron ${stock(hover)?.name || hover} — click Pulse NVDA to see ripples.`);
});

function draw() {
  const { w, h } = resize();
  const H = h;
  ctx.fillStyle = "#020208";
  ctx.fillRect(0, 0, w, H);

  const grd = ctx.createRadialGradient(w * 0.5, H * 0.45, 0, w * 0.5, H * 0.45, w * 0.55);
  grd.addColorStop(0, "rgba(80, 120, 255, 0.08)");
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, H);

  edges.forEach((e) => {
    const na = nodes.find((n) => n.sym === e.a);
    const nb = nodes.find((n) => n.sym === e.b);
    const pa = pos(na, w, H);
    const pb = pos(nb, w, H);
    ctx.strokeStyle = `rgba(100, 140, 255, ${e.r * 0.25})`;
    ctx.lineWidth = 1 + e.r;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  });

  pulses = pulses.filter((p) => {
    p.t += 0.018;
    if (p.t > 1) return false;
    const na = nodes.find((n) => n.sym === p.edge.a);
    const nb = nodes.find((n) => n.sym === p.edge.b);
    const pa = pos(na, w, H);
    const pb = pos(nb, w, H);
    const x = pa.x + (pb.x - pa.x) * p.t;
    const y = pa.y + (pb.y - pa.y) * p.t;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 28);
    g.addColorStop(0, "rgba(120, 200, 255, 0.9)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    return true;
  });

  nodes.forEach((n) => {
    n.glow *= 0.96;
    n.ring += 0.02;
    const p = pos(n, w, H);
    const px = p.x;
    const py = p.y;
    const active = hover === n.sym || n.glow > 0.2;
    const r = 18 + n.glow * 10;

    ctx.strokeStyle = `rgba(212, 168, 90, ${0.15 + n.glow * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, r + Math.sin(n.ring) * 4, 0, Math.PI * 2);
    ctx.stroke();

    const ng = ctx.createRadialGradient(px, py, 0, px, py, r);
    ng.addColorStop(0, `hsla(${n.hue}, 80%, 65%, ${0.5 + n.glow * 0.4})`);
    ng.addColorStop(1, "transparent");
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = active ? "#f0d49a" : "#8a94a8";
    ctx.font = "600 11px Inter Tight, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(n.sym, px, py + 4);
  });

  requestAnimationFrame(draw);
}
draw();

addEventListener("resize", () => resize());
