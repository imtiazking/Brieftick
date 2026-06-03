import {
  STOCKS,
  EDGES,
  mountChrome,
  LAB_NOTE,
  stock,
  displayName,
  narrateFocus,
  narrateLink,
  edgesFor,
  other,
} from "/design-lab/move-together/_together-mock.js";
import {
  setupCanvas,
  createInsightPanel,
  drawFlowStream,
  drawAmbientVignette,
  drawGlassNode,
  pickNode,
  prefersReducedMotion,
  lerp,
  easeInOutSine,
} from "/design-lab/move-together/_together-premium.js";

mountChrome("Market Currents", "01");
const insight = createInsightPanel("insight");
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const canvas = document.getElementById("canvas");
const nodes = STOCKS.map((s, i) => {
  const a = (i / STOCKS.length) * Math.PI * 2 - Math.PI / 2;
  const ring = 0.28 + (i % 4) * 0.04;
  return {
    sym: s.sym,
    name: s.name,
    bx: 0.5 + Math.cos(a) * ring,
    by: 0.5 + Math.sin(a) * ring * 0.85,
    x: 0,
    y: 0,
    glow: 0,
  };
});

let focus = null;
let mx = 0.5;
let my = 0.5;
let phase = 0;
let camX = 0;
let camY = 0;

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mx = (e.clientX - rect.left) / rect.width;
  my = (e.clientY - rect.top) / rect.height;
  const { w, h } = setupCanvas(canvas);
  const hit = pickNode(nodes, mx * w, my * h, 36);
  if (hit?.sym !== focus) {
    focus = hit?.sym || null;
    if (focus) {
      const top = edgesFor(focus, 0.55)[0];
      insight.show(
        focus,
        displayName(focus),
        narrateFocus(focus),
        top?.r ?? null
      );
      if (top) {
        insight.show(
          focus,
          displayName(focus),
          narrateLink(focus, other(focus, top), top.r),
          top.r
        );
      }
    } else {
      insight.show("Market currents", "Financial weather", "Strong relationships appear as smooth energy flows — not straight lines between tickers.");
    }
  }
});

canvas.addEventListener("pointerleave", () => {
  focus = null;
  insight.show("Market currents", "Financial weather", "Hover a holding to see which currents connect it to the rest of your book.");
});

function drawBackground(ctx, w, h, t) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0c101c");
  bg.addColorStop(0.5, "#060810");
  bg.addColorStop(1, "#03040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 6; i++) {
    const gx = w * (0.2 + i * 0.14) + Math.sin(t * 0.3 + i) * 30;
    const gy = h * 0.5 + Math.cos(t * 0.25 + i * 1.2) * 80;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.35);
    g.addColorStop(0, `rgba(142, 180, 255, ${0.04 + i * 0.008})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function tick() {
  const reduced = prefersReducedMotion();
  const { ctx, w, h } = setupCanvas(canvas);
  if (!reduced) phase += 0.012;

  camX = lerp(camX, (mx - 0.5) * 24, 0.06);
  camY = lerp(camY, (my - 0.5) * 18, 0.06);

  drawBackground(ctx, w, h, phase);

  nodes.forEach((n) => {
    n.x = n.bx * w + camX;
    n.y = n.by * h + camY;
    n.glow = lerp(n.glow, focus === n.sym ? 1 : focus ? 0.15 : 0.45, 0.08);
  });

  EDGES.forEach((e) => {
    const a = nodes.find((n) => n.sym === e.a);
    const b = nodes.find((n) => n.sym === e.b);
    if (!a || !b) return;
    const on = !focus || focus === e.a || focus === e.b;
    drawFlowStream(ctx, a.x, a.y, b.x, b.y, e.r, phase + e.r * 3, on ? 1 : 0.12);
  });

  nodes.forEach((n) => {
    drawGlassNode(ctx, n.x, n.y, n.sym, focus === n.sym, 0.9 + n.glow * 0.15);
  });

  drawAmbientVignette(ctx, w, h);
  requestAnimationFrame(tick);
}

insight.show("Market currents", "Financial weather", "Hover a holding to see which currents connect it to the rest of your book.");
tick();
window.addEventListener("resize", () => setupCanvas(canvas));
