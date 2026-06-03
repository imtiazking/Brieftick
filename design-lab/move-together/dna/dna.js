import {
  STOCKS,
  EDGES,
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
  drawGlassNode,
  pickNode,
  prefersReducedMotion,
  lerp,
} from "/design-lab/move-together/_together-premium.js";

mountChrome("Relationship DNA", "03");
const insight = createInsightPanel("insight");
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const canvas = document.getElementById("canvas");

/** Helix placement for each stock */
const helixNodes = STOCKS.map((s, i) => {
  const strand = i % 2;
  const t = i / STOCKS.length;
  return { sym: s.sym, strand, t, x: 0, y: 0, z: 0, glow: 0 };
});

let focus = null;
let rotY = 0;
let rotX = 0.35;
let mx = 0;
let my = 0;

function helixPoint(t, strand, rot) {
  const angle = t * Math.PI * 4 + strand * Math.PI + rot;
  const radius = 140;
  const y = (t - 0.5) * 520;
  return {
    x: Math.cos(angle) * radius,
    y,
    z: Math.sin(angle) * radius,
  };
}

function project(x, y, z, w, h) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  let x1 = x * cosY - z * sinY;
  let z1 = x * sinY + z * cosY;
  let y1 = y * cosX - z1 * sinX;
  z1 = y * sinX + z1 * cosX;
  const scale = 520 / (520 + z1);
  return {
    x: w * 0.5 + x1 * scale + mx * 20,
    y: h * 0.5 + y1 * scale + my * 12,
    scale,
    z: z1,
  };
}

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  mx = (px / rect.width - 0.5) * 2;
  my = (py / rect.height - 0.5) * 2;
  const hit = pickNode(
    helixNodes.map((n) => ({ sym: n.sym, x: n.x, y: n.y })),
    px,
    py,
    40
  );
  if (hit?.sym !== focus) {
    focus = hit?.sym || null;
    if (focus) {
      const top = edgesFor(focus, 0.55)[0];
      insight.show(
        focus,
        `Closest relatives · ${displayName(focus)}`,
        narrateFocus(focus),
        top?.r
      );
    } else {
      insight.show("Relationship DNA", "Double helix", "Names that move together sit on nearby strands. Hover to read why.");
    }
  }
});

function drawStrand(ctx, strand, w, h, rot) {
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const p = helixPoint(t, strand, rot);
    const pr = project(p.x, p.y, p.z, w, h);
    if (i === 0) ctx.moveTo(pr.x, pr.y);
    else ctx.lineTo(pr.x, pr.y);
  }
  const grad = ctx.createLinearGradient(w * 0.5, 0, w * 0.5, h);
  grad.addColorStop(0, "rgba(142, 180, 255, 0.08)");
  grad.addColorStop(0.5, "rgba(232, 201, 138, 0.35)");
  grad.addColorStop(1, "rgba(142, 180, 255, 0.08)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(232, 201, 138, 0.2)";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function tick() {
  const reduced = prefersReducedMotion();
  const { ctx, w, h } = setupCanvas(canvas);
  if (!reduced) rotY += 0.004;

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, h * 0.7);
  bg.addColorStop(0, "#0e1220");
  bg.addColorStop(1, "#03040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawStrand(ctx, 0, w, h, rotY);
  drawStrand(ctx, 1, w, h, rotY);

  const projected = helixNodes.map((n) => {
    const hp = helixPoint(n.t, n.strand, rotY);
    const pr = project(hp.x, hp.y, hp.z, w, h);
    n.x = pr.x;
    n.y = pr.y;
    n.z = pr.z;
    n.glow = lerp(n.glow, focus === n.sym ? 1 : focus ? 0.1 : 0.4, 0.1);
    return { ...n, ...pr };
  });

  projected.sort((a, b) => a.z - b.z);

  EDGES.forEach((e) => {
    const a = projected.find((n) => n.sym === e.a);
    const b = projected.find((n) => n.sym === e.b);
    if (!a || !b) return;
    const on = !focus || focus === e.a || focus === e.b;
    if (!on) return;
    ctx.strokeStyle = `rgba(232, 201, 138, ${e.r * 0.25})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  projected.forEach((n) => {
    drawGlassNode(ctx, n.x, n.y, n.sym, focus === n.sym, 0.75 + n.scale * 0.35);
  });

  drawAmbientVignette(ctx, w, h);
  requestAnimationFrame(tick);
}

insight.show("Relationship DNA", "Double helix", "Names that move together sit on nearby strands. Hover to read why.");
tick();
