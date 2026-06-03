import {
  STOCKS,
  mountChrome,
  LAB_NOTE,
  displayName,
  narrateFocus,
  edgesFor,
  other,
  narrateLink,
  stock,
} from "/design-lab/move-together/_together-mock.js";
import {
  setupCanvas,
  createInsightPanel,
  drawAmbientVignette,
  drawGlassNode,
  pickNode,
  prefersReducedMotion,
  lerp,
  easeOutCubic,
} from "/design-lab/move-together/_together-premium.js";

mountChrome("Market Lens", "05");
const insight = createInsightPanel("insight");
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const style = document.createElement("style");
style.textContent = `
  .ln-stage { position: fixed; inset: var(--chrome-h) 0 0; }
  .ln-canvas { position: absolute; inset: 0; }
  .ln-lens {
    position: absolute; width: 200px; height: 200px;
    border-radius: 50%; pointer-events: none; z-index: 5;
    border: 1px solid rgba(255,255,255,0.25);
    background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.14), rgba(14,18,32,0.05) 45%, transparent 70%);
    box-shadow:
      inset 0 0 40px rgba(255,255,255,0.08),
      0 0 80px rgba(142,180,255,0.15),
      0 24px 60px rgba(0,0,0,0.5);
    transform: translate(-50%, -50%) scale(0.85);
    opacity: 0;
    transition: opacity 0.5s var(--ease-out), transform 0.6s var(--ease-out);
  }
  .ln-lens.is-active {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  .ln-lens::after {
    content: ""; position: absolute; inset: 8px; border-radius: 50%;
    border: 1px solid rgba(232,201,138,0.35);
  }
  .ln-picker {
    position: fixed; top: calc(var(--chrome-h) + 20px); left: 50%; transform: translateX(-50%);
    z-index: 20; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
    max-width: 90vw; padding: 12px 16px; border-radius: 16px;
    border: 1px solid var(--glass-border);
    background: var(--glass-strong); backdrop-filter: blur(20px);
  }
  .ln-picker button {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
    padding: 8px 14px; border-radius: 99px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: var(--text-soft); cursor: pointer;
    transition: all 0.35s var(--ease-out);
  }
  .ln-picker button:hover, .ln-picker button.is-active {
    border-color: var(--gold-dim); color: var(--gold);
    background: rgba(232,201,138,0.12);
  }
`;
document.head.appendChild(style);

const stage = document.createElement("div");
stage.className = "ln-stage";
stage.innerHTML = `<canvas class="ln-canvas" id="canvas"></canvas><div class="ln-lens" id="lens"></div>`;
document.body.appendChild(stage);

const picker = document.createElement("div");
picker.className = "ln-picker";
picker.innerHTML = STOCKS.slice(0, 10)
  .map((s) => `<button type="button" data-sym="${s.sym}">${s.sym}</button>`)
  .join("");
document.body.appendChild(picker);

const canvas = document.getElementById("canvas");
const lensEl = document.getElementById("lens");

const nodes = STOCKS.map((s, i) => {
  const a = (i / STOCKS.length) * Math.PI * 2;
  return {
    sym: s.sym,
    bx: 0.5 + Math.cos(a) * 0.32,
    by: 0.5 + Math.sin(a) * 0.28,
    x: 0,
    y: 0,
    blur: 1,
    scale: 0.7,
  };
});

let focus = null;
let lensX = 0;
let lensY = 0;
let lensT = 0;

function setFocus(sym) {
  focus = sym;
  picker.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.sym === sym));
  if (!sym) {
    lensEl.classList.remove("is-active");
    insight.show("Market lens", "Focus to reveal", "Select a stock. The lens magnifies its closest moving partners.");
    return;
  }
  const n = nodes.find((x) => x.sym === sym);
  if (n) {
    lensX = lerp(lensX, n.x, 0.12);
    lensY = lerp(lensY, n.y, 0.12);
    lensEl.style.left = `${lensX}px`;
    lensEl.style.top = `${lensY}px`;
    lensEl.classList.add("is-active");
  }
  const top = edgesFor(sym, 0.5)[0];
  insight.show(
    sym,
    displayName(sym),
    top ? narrateLink(sym, other(sym, top), top.r) : narrateFocus(sym),
    top?.r
  );
}

picker.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) setFocus(btn.dataset.sym === focus ? null : btn.dataset.sym);
});

function tick() {
  const reduced = prefersReducedMotion();
  const { ctx, w, h } = setupCanvas(canvas);
  if (!reduced) lensT += 0.016;

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.55);
  bg.addColorStop(0, "#12182a");
  bg.addColorStop(1, "#03040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  nodes.forEach((n) => {
    n.x = n.bx * w;
    n.y = n.by * h;
    const related = focus && edgesFor(focus, 0.45).some((e) => other(focus, e) === n.sym);
    const isFocus = focus === n.sym;
    const targetBlur = !focus ? 0.35 : isFocus || related ? 0 : 0.85;
    const targetScale = !focus ? 0.85 : isFocus ? 1.15 : related ? 1 : 0.65;
    n.blur = lerp(n.blur, targetBlur, 0.08);
    n.scale = lerp(n.scale, targetScale, 0.08);
  });

  if (focus) {
    const fn = nodes.find((n) => n.sym === focus);
    if (fn) {
      lensX = lerp(lensX, fn.x, 0.1);
      lensY = lerp(lensY, fn.y, 0.1);
      lensEl.style.left = `${lensX}px`;
      lensEl.style.top = `${lensY}px`;
    }
  }

  const sorted = [...nodes].sort((a, b) => a.scale - b.scale);
  sorted.forEach((n) => {
    ctx.save();
    ctx.globalAlpha = 1 - n.blur * 0.65;
    if (n.blur > 0.3) {
      ctx.filter = `blur(${n.blur * 3}px)`;
    }
    drawGlassNode(ctx, n.x, n.y, n.sym, focus === n.sym, n.scale);
    ctx.restore();
  });

  if (focus) {
    const fn = nodes.find((n) => n.sym === focus);
    ctx.save();
    ctx.strokeStyle = "rgba(232, 201, 138, 0.2)";
    ctx.lineWidth = 1;
    const links = edgesFor(focus, 0.45);
    links.forEach((e) => {
      const peer = nodes.find((x) => x.sym === other(focus, e));
      if (!peer || !fn) return;
      ctx.beginPath();
      ctx.moveTo(fn.x, fn.y);
      ctx.lineTo(peer.x, peer.y);
      ctx.stroke();
    });
    ctx.restore();

    const rg = ctx.createRadialGradient(lensX, lensY, 0, lensX, lensY, 110);
    rg.addColorStop(0, "rgba(255,255,255,0.06)");
    rg.addColorStop(0.6, "rgba(142,180,255,0.04)");
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(lensX, lensY, 110, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAmbientVignette(ctx, w, h);
  requestAnimationFrame(tick);
}

setFocus(null);
tick();
