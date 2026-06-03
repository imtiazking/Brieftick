import {
  STOCKS,
  EDGES,
  mountChrome,
  mountNarrative,
  narrateLink,
  LAB_NOTE,
  stock,
} from "/design-lab/move-together/_together-mock.js";

mountChrome("Market Gravity", "04");
const narrative = mountNarrative("narrative");

const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.className = "mt-canvas";
stage.appendChild(canvas);
document.body.insertAdjacentHTML(
  "beforeend",
  `<p class="mt-badge">${LAB_NOTE}<br>Drag any node · throw to feel the network</p>`
);

const ctx = canvas.getContext("2d");

const nodes = STOCKS.map((s, i) => ({
  ...s,
  x: 120 + (i % 5) * (innerWidth / 5) * 0.7,
  y: 100 + Math.floor(i / 5) * 90 + Math.random() * 40,
  vx: 0,
  vy: 0,
  r: 22,
  dragging: false,
}));

const edges = EDGES;

let drag = null;
let pointer = { x: 0, y: 0 };

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

function nodeAt(x, y) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy < n.r * n.r) return n;
  }
  return null;
}

canvas.addEventListener("pointerdown", (e) => {
  const n = nodeAt(e.clientX, e.clientY - 48);
  if (!n) return;
  drag = n;
  n.dragging = true;
  pointer = { x: e.clientX, y: e.clientY - 48 };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const y = e.clientY - 48;
  if (drag) {
    drag.vx = (e.clientX - pointer.x) * 0.35;
    drag.vy = (y - pointer.y) * 0.35;
    drag.x = e.clientX;
    drag.y = y;
    pointer = { x: e.clientX, y };
    narrative.set(drag.sym, `Holding ${stock(drag.sym)?.name || drag.sym} — correlated names pull closer.`);
  } else {
    const n = nodeAt(e.clientX, y);
    narrative.set(n?.sym || null, n ? `${n.sym} — grab and throw` : "Touch the market. Strong links pull together.");
  }
});

canvas.addEventListener("pointerup", () => {
  if (drag) drag.dragging = false;
  drag = null;
});

function simulate(w, h) {
  const centerX = w * 0.5;
  const centerY = h * 0.5;

  nodes.forEach((n) => {
    if (n.dragging) return;
    n.vx += (centerX - n.x) * 0.00008;
    n.vy += (centerY - n.y) * 0.00008;
    n.vx *= 0.94;
    n.vy *= 0.94;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(n.r, Math.min(w - n.r, n.x));
    n.y = Math.max(n.r, Math.min(h - n.r, n.y));
  });

  edges.forEach((e) => {
    const a = nodes.find((n) => n.sym === e.a);
    const b = nodes.find((n) => n.sym === e.b);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const target = 90 + (1 - e.r) * 120;
    const force = (dist - target) * 0.002 * e.r;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.dragging) {
      a.vx += fx;
      a.vy += fy;
    }
    if (!b.dragging) {
      b.vx -= fx;
      b.vy -= fy;
    }
  });

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy || 1;
      const rep = 800 / d2;
      if (!a.dragging) {
        a.vx -= (dx / Math.sqrt(d2)) * rep * 0.02;
        a.vy -= (dy / Math.sqrt(d2)) * rep * 0.02;
      }
      if (!b.dragging) {
        b.vx += (dx / Math.sqrt(d2)) * rep * 0.02;
        b.vy += (dy / Math.sqrt(d2)) * rep * 0.02;
      }
    }
  }
}

function draw() {
  const { w, h } = resize();
  simulate(w, h);

  ctx.fillStyle = "rgba(2, 2, 8, 0.35)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#020208";
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  edges.forEach((e) => {
    const a = nodes.find((n) => n.sym === e.a);
    const b = nodes.find((n) => n.sym === e.b);
    ctx.strokeStyle = `rgba(212, 168, 90, ${0.08 + e.r * 0.35})`;
    ctx.lineWidth = e.r * 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  nodes.forEach((n) => {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2);
    g.addColorStop(0, `hsla(${n.hue}, 70%, 60%, 0.5)`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = n.dragging ? "#f0d49a" : "#c5ccd8";
    ctx.font = "600 12px Inter Tight";
    ctx.textAlign = "center";
    ctx.fillText(n.sym, n.x, n.y + 4);
  });

  requestAnimationFrame(draw);
}
draw();
narrative.set(null, "Touch the market. Strong links pull together.");
