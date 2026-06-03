import {
  STOCKS,
  EDGES,
  CLUSTERS,
  mountChrome,
  LAB_NOTE,
  displayName,
  narrateFocus,
  narrateLink,
  edgesFor,
  other,
  stock,
} from "/design-lab/move-together/_together-mock.js";
import {
  setupCanvas,
  createInsightPanel,
  drawAmbientVignette,
  prefersReducedMotion,
  lerp,
  easeInOutSine,
} from "/design-lab/move-together/_together-premium.js";

mountChrome("Portfolio Ecosystem", "02");
const insight = createInsightPanel("insight");
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const style = document.createElement("style");
style.textContent = `
  .eco-stage { position: fixed; inset: var(--chrome-h) 0 0; overflow: hidden; }
  .eco-canvas { position: absolute; inset: 0; z-index: 1; }
  .eco-islands {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
  }
  .eco-island {
    position: absolute; transform: translate(-50%, -50%);
    padding: 20px 24px 18px; min-width: 160px;
    border-radius: 22px;
    border: 1px solid var(--glass-border);
    background: linear-gradient(160deg, rgba(24, 30, 52, 0.85), rgba(10, 12, 22, 0.65));
    backdrop-filter: blur(24px) saturate(1.4);
    box-shadow: var(--shadow);
    pointer-events: auto;
    transition: transform 0.6s var(--ease-out), border-color 0.5s, box-shadow 0.5s;
  }
  .eco-island.is-focus {
    border-color: var(--gold-dim);
    box-shadow: 0 28px 70px rgba(0,0,0,0.5), 0 0 60px rgba(232,201,138,0.08);
    transform: translate(-50%, -50%) scale(1.03);
  }
  .eco-island__lbl {
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
    text-transform: uppercase; margin-bottom: 8px;
  }
  .eco-island strong { font-family: var(--display); font-size: 18px; font-weight: 500; display: block; margin-bottom: 12px; }
  .eco-orbit {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .eco-chip {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em;
    padding: 6px 10px; border-radius: 99px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: var(--text-soft);
    cursor: pointer; pointer-events: auto;
    transition: background 0.35s, color 0.35s, border-color 0.35s, transform 0.35s var(--ease-out);
  }
  .eco-chip:hover, .eco-chip.is-focus {
    background: rgba(232,201,138,0.15);
    border-color: var(--gold-dim);
    color: var(--text);
    transform: translateY(-1px);
  }
`;
document.head.appendChild(style);

const stage = document.createElement("div");
stage.className = "eco-stage";
stage.innerHTML = `<canvas class="eco-canvas" id="canvas"></canvas><div class="eco-islands" id="islands"></div>`;
document.body.appendChild(stage);

const islandPos = {
  ai: { x: 50, y: 42 },
  banks: { x: 22, y: 62 },
  energy: { x: 78, y: 58 },
  health: { x: 72, y: 28 },
  market: { x: 28, y: 28 },
};

const islandsEl = document.getElementById("islands");
CLUSTERS.forEach((c) => {
  const pos = islandPos[c.id];
  const holdings = STOCKS.filter((s) => s.sector === c.id);
  const el = document.createElement("div");
  el.className = "eco-island";
  el.dataset.sector = c.id;
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;
  el.innerHTML = `
    <div class="eco-island__lbl" style="color:${c.color}">${c.label}</div>
    <strong>${holdings.length} holdings</strong>
    <div class="eco-orbit">${holdings
      .map(
        (h) =>
          `<button type="button" class="eco-chip" data-sym="${h.sym}">${h.sym}</button>`
      )
      .join("")}</div>`;
  islandsEl.appendChild(el);
});

const canvas = document.getElementById("canvas");
let focus = null;
let wavePhase = 0;

function islandCenter(id) {
  const el = islandsEl.querySelector(`[data-sector="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
}

function setFocus(sym) {
  focus = sym;
  islandsEl.querySelectorAll(".eco-island").forEach((el) => el.classList.remove("is-focus"));
  islandsEl.querySelectorAll(".eco-chip").forEach((el) => el.classList.toggle("is-focus", el.dataset.sym === sym));
  if (!sym) {
    insight.show("Portfolio ecosystem", "Living sectors", "Each island is a theme. Holdings orbit within their sector; waves connect related islands.");
    return;
  }
  const s = stock(sym);
  islandsEl.querySelector(`[data-sector="${s?.sector}"]`)?.classList.add("is-focus");
  const top = edgesFor(sym, 0.55)[0];
  insight.show(sym, displayName(sym), narrateFocus(sym), top?.r);
}

islandsEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".eco-chip");
  if (chip) setFocus(chip.dataset.sym);
});

function drawWaves() {
  const reduced = prefersReducedMotion();
  const { ctx, w, h } = setupCanvas(canvas);
  if (!reduced) wavePhase += 0.018;

  ctx.clearRect(0, 0, w, h);

  const crossSector = EDGES.filter((e) => stock(e.a)?.sector !== stock(e.b)?.sector);
  crossSector.forEach((e, i) => {
    const sa = stock(e.a)?.sector;
    const sb = stock(e.b)?.sector;
    const pa = islandCenter(sa);
    const pb = islandCenter(sb);
    if (!pa || !pb) return;
    const on = !focus || focus === e.a || focus === e.b;
    const alpha = on ? e.r * 0.5 : 0.06;
    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2 - 40 + Math.sin(wavePhase + i) * 12;

    ctx.save();
    ctx.strokeStyle = `rgba(142, 180, 255, ${alpha})`;
    ctx.lineWidth = 1 + e.r * 2;
    ctx.shadowColor = `rgba(232, 201, 138, ${alpha * 0.5})`;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.quadraticCurveTo(midX, midY, pb.x, pb.y);
    ctx.stroke();

    const t = (Math.sin(wavePhase * 1.5 + i) + 1) / 2;
    const px = pa.x + (pb.x - pa.x) * t;
    const py = pa.y + (pb.y - pa.y) * t + (midY - (pa.y + pb.y) / 2) * 0.5;
    const g = ctx.createRadialGradient(px, py, 0, px, py, 20);
    g.addColorStop(0, `rgba(232, 201, 138, ${alpha})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  drawAmbientVignette(ctx, w, h);
  requestAnimationFrame(drawWaves);
}

setFocus(null);
drawWaves();
