import {
  STOCKS,
  EDGES,
  mountChrome,
  LAB_NOTE,
  displayName,
  narrateFocus,
  edgesFor,
  other,
  narrateLink,
} from "/design-lab/move-together/_together-mock.js";
import {
  setupCanvas,
  createInsightPanel,
  drawAmbientVignette,
  prefersReducedMotion,
  lerp,
} from "/design-lab/move-together/_together-premium.js";

mountChrome("Signal Chamber", "04");
const insight = createInsightPanel("insight");
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const style = document.createElement("style");
style.textContent = `
  .ch-stage {
    position: fixed; inset: var(--chrome-h) 0 0;
    display: flex; align-items: center; justify-content: center;
    perspective: 1200px;
  }
  .ch-canvas { position: absolute; inset: 0; z-index: 1; }
  .ch-ring {
    position: relative; z-index: 2;
    width: min(92vw, 640px); height: min(92vw, 640px);
    transform-style: preserve-3d;
    transition: transform 0.8s var(--ease-out);
  }
  .ch-floor {
    position: absolute; left: 50%; top: 54%; transform: translate(-50%, -50%);
    width: 70%; height: 70%; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(142,180,255,0.08), transparent 65%);
    filter: blur(2px);
  }
  .ch-panel {
    position: absolute; left: 50%; top: 50%;
    width: 108px; padding: 14px 12px;
    border-radius: 16px;
    border: 1px solid var(--glass-border);
    background: linear-gradient(165deg, rgba(28, 34, 56, 0.9), rgba(12, 14, 24, 0.75));
    backdrop-filter: blur(20px);
    box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    text-align: center;
    cursor: pointer;
    transform-style: preserve-3d;
    transition: border-color 0.45s, box-shadow 0.45s, transform 0.5s var(--ease-out);
  }
  .ch-panel:hover, .ch-panel.is-focus {
    border-color: var(--gold-dim);
    box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 40px rgba(232,201,138,0.12);
    transform: translate(-50%, -50%) translateZ(24px) scale(1.06);
  }
  .ch-panel span {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
    color: var(--text-soft);
  }
  .ch-panel.is-focus span { color: var(--gold); }
  .ch-core {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: 100px; height: 100px; border-radius: 50%;
    border: 1px solid var(--gold-dim);
    background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.12), rgba(14,18,32,0.9));
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em;
    color: var(--gold); text-transform: uppercase;
    box-shadow: 0 0 60px rgba(232,201,138,0.15);
  }
`;
document.head.appendChild(style);

const stage = document.createElement("div");
stage.className = "ch-stage";
stage.innerHTML = `<canvas class="ch-canvas" id="canvas"></canvas><div class="ch-floor"></div><div class="ch-ring" id="ring"></div>`;
document.body.appendChild(stage);

const ring = document.getElementById("ring");
const slice = STOCKS.slice(0, 12);
const radius = 42;

slice.forEach((s, i) => {
  const angle = (i / slice.length) * 360;
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ch-panel";
  el.dataset.sym = s.sym;
  el.style.transform = `translate(-50%, -50%) rotateY(${angle}deg) translateZ(280px)`;
  el.innerHTML = `<span>${s.sym}</span>`;
  ring.appendChild(el);
});

const core = document.createElement("div");
core.className = "ch-core";
core.textContent = "Signal";
ring.appendChild(core);

const canvas = document.getElementById("canvas");
let focus = null;
let sweep = 0;
let ringRot = 0;
let ringRotCur = 0;

function setFocus(sym) {
  focus = sym;
  ring.querySelectorAll(".ch-panel").forEach((p) => {
    p.classList.toggle("is-focus", p.dataset.sym === sym);
  });
  if (!sym) {
    insight.show("Signal chamber", "Command view", "Stocks sit on curved glass. Radar arcs reveal who moves together.");
    ringRotCur = lerp(ringRotCur, 0, 0.05);
    return;
  }
  const top = edgesFor(sym, 0.55)[0];
  const idx = slice.findIndex((s) => s.sym === sym);
  ringRotCur = -(idx / slice.length) * 360;
  insight.show(sym, displayName(sym), top ? narrateLink(sym, other(sym, top), top.r) : narrateFocus(sym), top?.r);
}

ring.addEventListener("click", (e) => {
  const p = e.target.closest(".ch-panel");
  if (p) setFocus(p.dataset.sym);
});

function drawRadar() {
  const reduced = prefersReducedMotion();
  const { ctx, w, h } = setupCanvas(canvas);
  const cx = w / 2;
  const cy = h / 2;
  if (!reduced) sweep += 0.02;

  ctx.clearRect(0, 0, w, h);

  for (let r = 1; r <= 4; r++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + r * 0.01})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 70, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sweepAngle = sweep;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sweepAngle);
  const grad = ctx.createLinearGradient(0, 0, w * 0.45, 0);
  grad.addColorStop(0, "rgba(232, 201, 138, 0.35)");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, w * 0.45, -0.35, 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (focus) {
    const related = edgesFor(focus, 0.5);
    related.forEach((e, i) => {
      const idx = slice.findIndex((s) => s.sym === other(focus, e));
      if (idx < 0) return;
      const angle = (idx / slice.length) * Math.PI * 2 - Math.PI / 2;
      const len = 120 + e.r * 180;
      ctx.strokeStyle = `rgba(232, 201, 138, ${e.r * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(232, 201, 138, 0.3)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  drawAmbientVignette(ctx, w, h);

  ringRot = lerp(ringRot, ringRotCur, 0.06);
  ring.style.transform = `rotateY(${ringRot}deg)`;

  requestAnimationFrame(drawRadar);
}

setFocus(null);
drawRadar();
