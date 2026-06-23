/**
 * Shared Concept 10 Split atmosphere — env, rivers, pointer-reactive motion.
 */

export function riverText() {
  return "FORGENIQ · MARKET INTELLIGENCE · EQUITIES · MACRO · EARNINGS · ".repeat(8);
}

function cwParticles(n = 22) {
  return Array.from({ length: n }, (_, i) =>
    `<i style="left:${(i * 17 + 5) % 100}%;animation-delay:${(i * 0.7) % 12}s;animation-duration:${14 + (i % 8)}s"></i>`
  ).join("");
}

export function buildSplitEnvHtml(particleCount = 22) {
  return `<div class="cw-env"><div class="cw-cam">
    <div class="cw-fog"></div>
    <div class="cw-particles">${cwParticles(particleCount)}</div>
    <div class="cw-grid"></div>
    <div class="cw-scan"></div>
    <div class="cw-vignette"></div>
    <div class="cw-react-glow"></div>
    <div class="cw-dual"><span></span><span></span></div>
  </div></div>`;
}

export function buildSplitRiversHtml() {
  const tick = riverText();
  return `<div class="cw-river cw-river--b" aria-hidden="true"><span class="cw-river-track">${tick}${tick}</span></div>`;
}

/**
 * @param {{ particles?: number, rivers?: boolean, hud?: string, extraClass?: string }} opts
 */
export function buildSplitShellHtml(opts = {}) {
  const particles = opts.particles ?? 22;
  const rivers = opts.rivers !== false;
  const hud = opts.hud
    ? `<div class="cw-hud">${opts.hud}</div>`
    : "";
  const extra = opts.extraClass ? ` ${opts.extraClass}` : "";
  return `<div class="cw cw--dual${extra}" data-cw-variant="dual">
    ${buildSplitEnvHtml(particles)}${rivers ? buildSplitRiversHtml() : ""}${hud}
  </div>`;
}

export function refreshSplitRivers(root) {
  const tick = riverText();
  root.querySelectorAll(".cw-river--b .cw-river-track, .cw-river--b > span").forEach((el) => {
    el.innerHTML = tick + tick;
  });
}

/**
 * Pointer-reactive motion + scroll depth (same as Design Lab / landing).
 * @param {HTMLElement} root — contains `.cw` or is the `.cw` element
 * @param {{ snap?: boolean, pointerTarget?: HTMLElement }} opts
 */
export function initSplitCinematic(root, opts = {}) {
  const world = root.classList?.contains("cw") ? root : root.querySelector(".cw");
  if (!world || world.dataset.cwInit === "1") return null;
  world.dataset.cwInit = "1";

  const cam = world.querySelector(".cw-cam");
  const scroller = opts.snap && world.classList.contains("cw--snap") ? world : null;
  const pointerEl = opts.pointerTarget || world;
  const scenes = world.querySelectorAll(".cw-scene");
  const dots = world.querySelectorAll(".cw-progress i");
  let mx = 0;
  let my = 0;
  let raf = 0;
  let alive = true;
  let moveRect = null;

  const applyPointer = () => {
    if (!alive || document.hidden) return;
    if (cam) cam.style.transform = `translate3d(${mx * 32}px, ${my * 22}px, 0) scale(1.06)`;
    world.style.setProperty("--mx", String(mx));
    world.style.setProperty("--my", String(my));
  };

  const onMove = (e) => {
    if (!alive || document.hidden) return;
    if (!moveRect) moveRect = pointerEl.getBoundingClientRect();
    mx = (e.clientX - moveRect.left) / moveRect.width - 0.5;
    my = (e.clientY - moveRect.top) / moveRect.height - 0.5;
    if (!raf) raf = requestAnimationFrame(() => { applyPointer(); raf = 0; });
  };

  const onScroll = () => {
    if (!alive || document.hidden) return;
    const st = scroller ? scroller.scrollTop : window.scrollY;
    const h = (scroller ? scroller.scrollHeight - scroller.clientHeight : document.documentElement.scrollHeight - window.innerHeight) || 1;
    const p = Math.min(1, Math.max(0, st / h));
    world.style.setProperty("--scroll", String(p));
    world.classList.toggle("cw--deep", p > 0.2);
  };

  const onResize = () => { moveRect = null; };
  pointerEl.addEventListener("mousemove", onMove, { passive: true });
  (scroller || window).addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  onScroll();

  let obs = null;
  if (scenes.length && dots.length) {
    obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-active");
          const i = [...scenes].indexOf(e.target);
          dots.forEach((d, j) => d.classList.toggle("is-on", j === i));
        });
      },
      { root: scroller, threshold: 0.45 }
    );
    scenes.forEach((s) => obs.observe(s));
  }

  const onVis = () => {
    document.documentElement.classList.toggle("bt-paused", document.hidden);
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    pointerEl.removeEventListener("mousemove", onMove);
    window.removeEventListener("resize", onResize);
    (scroller || window).removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVis);
    obs?.disconnect();
    world.dataset.cwInit = "";
    world.classList.remove("cw--focus", "cw--deep");
  };
}
