import {
  STOCKS,
  EDGES,
  CLUSTERS,
  mountChrome,
  mountNarrative,
  narrateFocus,
  LAB_NOTE,
} from "/design-lab/move-together/_together-mock.js";

mountChrome("Portfolio Galaxy", "03");
const narrative = mountNarrative("narrative");

const stage = document.getElementById("stage");
stage.innerHTML = `
  <canvas class="mt-canvas" id="galCanvas"></canvas>
  <div class="galaxy-core glass" id="galCore">
    <span class="galaxy-core__lbl">Your portfolio</span>
    <strong>14 holdings</strong>
    <p>Drift · scroll wheel zooms depth</p>
  </div>
  <div class="galaxy-clusters" id="galClusters"></div>
`;

const style = document.createElement("style");
style.textContent = `
  .galaxy-core {
    position: fixed; left: 50%; top: 54%; transform: translate(-50%, -50%);
    z-index: 20; text-align: center; padding: 28px 36px; pointer-events: none;
    animation: corePulse 5s ease-in-out infinite;
  }
  @keyframes corePulse {
    0%,100% { box-shadow: 0 0 60px rgba(212,168,90,0.2); }
    50% { box-shadow: 0 0 100px rgba(212,168,90,0.35); }
  }
  .galaxy-core__lbl { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; color: var(--gold); text-transform: uppercase; }
  .galaxy-core strong { display: block; font-family: var(--display); font-size: 22px; margin: 8px 0; }
  .galaxy-core p { font-size: 12px; color: var(--muted); }
  .galaxy-clusters {
    position: fixed; inset: 48px 0 0; pointer-events: none; perspective: 900px;
    transform-style: preserve-3d;
  }
  .galaxy-cluster {
    position: absolute; padding: 12px 16px; border-radius: 12px;
    border: 1px solid var(--line); background: var(--glass);
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
    color: var(--gold); transition: opacity 0.5s, transform 0.6s var(--ease);
    pointer-events: auto; cursor: default;
  }
  .galaxy-cluster.is-near { opacity: 1; border-color: var(--gold-dim); transform: scale(1.05); }
`;
document.head.appendChild(style);

const clustersEl = document.getElementById("galClusters");
CLUSTERS.forEach((c, i) => {
  const el = document.createElement("div");
  el.className = "galaxy-cluster";
  el.dataset.id = c.id;
  el.textContent = c.label;
  el.style.left = `${12 + (i % 3) * 30}%`;
  el.style.top = `${18 + Math.floor(i / 3) * 28}%`;
  clustersEl.appendChild(el);
});

document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const canvas = document.getElementById("galCanvas");
const ctx = canvas.getContext("2d");

const edges = EDGES;

const stars = STOCKS.map((s, i) => {
  const cluster = CLUSTERS.find((c) => c.id === s.sector);
  const angle = (i / STOCKS.length) * Math.PI * 2;
  const ring = s.sector === "ai" ? 0.32 : s.sector === "banks" ? 0.42 : 0.38;
  return {
    ...s,
    color: cluster?.color || "#888",
    bx: 0.5 + Math.cos(angle) * ring,
    by: 0.5 + Math.sin(angle) * ring * 0.7,
    z: Math.random(),
    parallax: 0.3 + Math.random() * 0.5,
  };
});

let mx = 0.5;
let my = 0.5;
let depth = 1;
let focus = null;

addEventListener("pointermove", (e) => {
  mx = e.clientX / innerWidth;
  my = (e.clientY - 48) / (innerHeight - 48);
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    depth = Math.max(0.6, Math.min(1.8, depth - e.deltaY * 0.001));
  },
  { passive: false }
);

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

function draw() {
  const { w, h } = resize();
  ctx.fillStyle = "#020208";
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 80; i++) {
    const px = ((i * 97) % 1000) / 1000;
    const py = ((i * 57) % 1000) / 1000;
    const dx = (px - 0.5 + (mx - 0.5) * 0.08) * w;
    const dy = (py - 0.5 + (my - 0.5) * 0.08) * h;
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.01})`;
    ctx.fillRect(dx, dy, 1.5, 1.5);
  }

  const cx = w * 0.5 + (mx - 0.5) * 40;
  const cy = h * 0.5 + (my - 0.5) * 30;

  edges.forEach((e) => {
    const a = stars.find((s) => s.sym === e.a);
    const b = stars.find((s) => s.sym === e.b);
    if (!a || !b) return;
    const on = !focus || focus === e.a || focus === e.b;
    const ax = a.bx * w + (mx - 0.5) * a.parallax * 60;
    const ay = a.by * h + (my - 0.5) * a.parallax * 40;
    const bx = b.bx * w + (mx - 0.5) * b.parallax * 60;
    const by = b.by * h + (my - 0.5) * b.parallax * 40;
    ctx.strokeStyle = `rgba(212, 168, 90, ${on ? e.r * 0.35 * depth : 0.04})`;
    ctx.lineWidth = on ? 1 + e.r * 2 : 0.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });

  stars.forEach((s) => {
    const x = s.bx * w + (mx - 0.5) * s.parallax * 60;
    const y = s.by * h + (my - 0.5) * s.parallax * 40;
    const scale = (0.6 + s.z * 0.4) * depth;
    const lit = !focus || focus === s.sym || EDGES.some(
      (ed) => (ed.a === focus && ed.b === s.sym) || (ed.b === focus && ed.a === s.sym)
    );
    const r = (lit ? 10 : 5) * scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, lit ? s.color : "rgba(80,80,90,0.5)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
    if (lit) {
      ctx.fillStyle = "#e8ecf5";
      ctx.font = `600 ${9 + scale * 3}px Inter Tight`;
      ctx.textAlign = "center";
      ctx.fillText(s.sym, x, y + 3);
    }
  });

  const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 * depth);
  coreGlow.addColorStop(0, "rgba(212,168,90,0.15)");
  coreGlow.addColorStop(1, "transparent");
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 120 * depth, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(draw);
}

canvas.addEventListener("pointermove", (e) => {
  const { w, h } = resize();
  focus = null;
  for (const s of stars) {
    const x = s.bx * w + (mx - 0.5) * s.parallax * 60;
    const y = s.by * h + (my - 0.5) * s.parallax * 40;
    if ((e.clientX - x) ** 2 + (e.clientY - 48 - y) ** 2 < 400) focus = s.sym;
  }
  clustersEl.querySelectorAll(".galaxy-cluster").forEach((el) => {
    const id = el.dataset.id;
    const near = focus && stars.find((s) => s.sym === focus)?.sector === id;
    el.classList.toggle("is-near", near);
  });
  if (focus) narrative.set(focus, narrateFocus(focus));
  else narrative.set(null, "Scroll to zoom through depth. Your holdings orbit theme clusters.");
});

draw();
narrative.set(null, "Scroll to zoom through depth. Your holdings orbit theme clusters.");
