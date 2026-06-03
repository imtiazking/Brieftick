/**
 * Shared premium utilities for Move Together design-lab.
 */

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const parent = canvas.parentElement;
  const w = parent?.clientWidth || window.innerWidth;
  const h = parent?.clientHeight || window.innerHeight - 52;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

/**
 * @param {string} id
 */
export function createInsightPanel(id = "insight") {
  const el = document.getElementById(id);
  if (!el) return null;
  el.className = "mt-insight";
  el.innerHTML = `
    <p class="mt-insight__eyebrow">Relationship</p>
    <h2 class="mt-insight__title">Select a holding</h2>
    <p class="mt-insight__body">Move across the scene to reveal how names move together.</p>
    <div class="mt-insight__strength" hidden>
      <div class="mt-insight__bar"><i style="width:0%"></i></div>
      <span class="mt-insight__pct"></span>
    </div>`;
  return {
    el,
    show(sym, title, body, strength = null) {
      el.classList.add("is-visible");
      el.querySelector(".mt-insight__eyebrow").textContent = sym || "Overview";
      el.querySelector(".mt-insight__title").textContent = title;
      el.querySelector(".mt-insight__body").textContent = body;
      const row = el.querySelector(".mt-insight__strength");
      if (strength != null && row) {
        row.hidden = false;
        row.querySelector("i").style.width = `${Math.round(strength * 100)}%`;
        row.querySelector(".mt-insight__pct").textContent = `Strength ${(strength * 100).toFixed(0)}%`;
      } else if (row) row.hidden = true;
    },
    hide() {
      el.classList.remove("is-visible");
    },
  };
}

/**
 * Draw a flowing current between two points.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawFlowStream(ctx, x1, y1, x2, y2, strength, phase, alpha = 1) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const perpX = -dy * 0.22;
  const perpY = dx * 0.22;
  const c1x = mx + perpX + Math.sin(phase) * 12;
  const c1y = my + perpY + Math.cos(phase * 0.8) * 12;
  const w = 2 + strength * 5;

  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, `rgba(142, 180, 255, 0)`);
  grad.addColorStop(0.35 + Math.sin(phase) * 0.1, `rgba(232, 201, 138, ${0.35 * alpha * strength})`);
  grad.addColorStop(0.65 + Math.cos(phase) * 0.1, `rgba(142, 180, 255, ${0.45 * alpha * strength})`);
  grad.addColorStop(1, `rgba(142, 180, 255, 0)`);

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(232, 201, 138, 0.35)";
  ctx.shadowBlur = 12 * strength;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(c1x, c1y, x2, y2);
  ctx.stroke();

  const t = (Math.sin(phase * 2) + 1) / 2;
  const px = lerp(x1, x2, t) + (c1x - mx) * 0.3;
  const py = lerp(y1, y2, t) + (c1y - my) * 0.3;
  const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
  glow.addColorStop(0, `rgba(255, 240, 210, ${0.7 * alpha * strength})`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawAmbientVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.1, w * 0.5, h * 0.5, h * 0.75);
  v.addColorStop(0, "transparent");
  v.addColorStop(1, "rgba(3, 4, 10, 0.65)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawGlassNode(ctx, x, y, label, active, scale = 1) {
  const r = (active ? 28 : 22) * scale;
  ctx.save();
  const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r * 1.8);
  g.addColorStop(0, active ? "rgba(255, 248, 235, 0.25)" : "rgba(255, 255, 255, 0.08)");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = active
    ? "rgba(22, 28, 48, 0.92)"
    : "rgba(14, 18, 32, 0.75)";
  ctx.strokeStyle = active ? "rgba(232, 201, 138, 0.55)" : "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = active ? 1.5 : 1;
  ctx.shadowColor = active ? "rgba(232, 201, 138, 0.25)" : "transparent";
  ctx.shadowBlur = active ? 20 : 0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = active ? "#f2f4f9" : "#b8c0d0";
  ctx.font = `600 ${active ? 13 : 11}px Inter Tight, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

/**
 * @param {{ x: number, y: number, sym: string }[]} nodes
 */
export function pickNode(nodes, x, y, pad = 32) {
  let best = null;
  let bestD = pad * pad;
  for (const n of nodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
