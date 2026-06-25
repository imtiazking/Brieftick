/**
 * Money Flow bubble map — touch-first mobile layout (≤768px only).
 * @module preview/flow-bubble-mobile
 */

import { getFlowIndustryDetail, renderFlowDetailContent } from "./flow-bubble-detail.js";

export const FLOW_MOBILE_MQ = "(max-width: 768px)";

/** Spread pentagon layout — more separation than desktop packed orbit. */
const MOBILE_ANCHORS = {
  technology: { x: 50, y: 50 },
  industrials: { x: 22, y: 20 },
  defensives: { x: 78, y: 24 },
  financials: { x: 24, y: 78 },
  energy: { x: 76, y: 76 },
};

const MOBILE_SIZE = { min: 44, max: 88 };
const MIN_HIT_PX = 44;
const DEFAULT_ZOOM = 0.86;

export function isFlowMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(FLOW_MOBILE_MQ).matches;
}

function mobileBubbleDiameter(pct) {
  const maxPct = 38;
  const t = pct / maxPct;
  return Math.round(MOBILE_SIZE.min + t * (MOBILE_SIZE.max - MOBILE_SIZE.min));
}

/**
 * Static force-style layout — larger collision radius, stable positions.
 * @param {HTMLElement} cluster
 * @param {HTMLElement[]} bubbleEls
 */
export function applyMobileBubbleLayout(cluster, bubbleEls) {
  const pad = 28;
  const w = cluster.clientWidth || 320;
  const h = cluster.clientHeight || 260;

  const nodes = bubbleEls.map((el) => {
    const id = el.dataset.flowId || "";
    const pct = Number(el.dataset.flowPct) || Number(el.style.getPropertyValue("--pct")) || 10;
    const anchor = MOBILE_ANCHORS[id] || { x: 50, y: 50 };
    const visualR = mobileBubbleDiameter(pct) / 2;
    const hitR = Math.max(MIN_HIT_PX, visualR * 2) / 2;
    return {
      el,
      id,
      pct,
      anchorX: (anchor.x / 100) * w,
      anchorY: (anchor.y / 100) * h,
      x: (anchor.x / 100) * w,
      y: (anchor.y / 100) * h,
      r: visualR,
      hitR,
    };
  });

  for (let iter = 0; iter < 140; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minDist = a.hitR + b.hitR + 14;
        if (dist < minDist) {
          const push = (minDist - dist) * 0.55;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    nodes.forEach((n) => {
      n.x += (n.anchorX - n.x) * 0.06;
      n.y += (n.anchorY - n.y) * 0.06;
      n.x = Math.max(pad + n.hitR, Math.min(w - pad - n.hitR, n.x));
      n.y = Math.max(pad + n.hitR, Math.min(h - pad - n.hitR, n.y));
    });
  }

  nodes.forEach((n) => {
    const size = n.r * 2;
    n.el.style.setProperty("--x", `${(n.x / w) * 100}%`);
    n.el.style.setProperty("--y", `${(n.y / h) * 100}%`);
    n.el.style.setProperty("--size", `${size}px`);
    n.el.style.setProperty("--hit", `${Math.max(MIN_HIT_PX, size)}px`);
    n.el.dataset.flowPct = String(n.pct);
  });

  cluster.classList.add("is-layout-settled");
}

/**
 * Pinch-zoom + pan + double-tap reset on the bubble stage.
 * @param {HTMLElement} map
 * @param {HTMLElement} cluster
 * @param {HTMLElement} stage
 */
export function bindFlowViewportGestures(map, cluster, stage) {
  let scale = DEFAULT_ZOOM;
  let tx = 0;
  let ty = 0;
  let panning = false;
  let pinchStartDist = 0;
  let pinchStartScale = scale;
  let lastX = 0;
  let lastY = 0;
  let lastTap = 0;

  const apply = () => {
    cluster.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const reset = () => {
    scale = DEFAULT_ZOOM;
    tx = 0;
    ty = 0;
    apply();
    map.classList.remove("is-panning");
  };

  apply();

  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest(".flow-bubble")) return;
      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      map.classList.add("is-panning");
      stage.setPointerCapture(e.pointerId);
    },
    { passive: true }
  );

  stage.addEventListener(
    "pointermove",
    (e) => {
      if (!panning) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    },
    { passive: true }
  );

  const endPan = (e) => {
    if (!panning) return;
    panning = false;
    map.classList.remove("is-panning");
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };
  stage.addEventListener("pointerup", endPan);
  stage.addEventListener("pointercancel", endPan);

  stage.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchStartScale = scale;
      }
    },
    { passive: true }
  );

  stage.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 2 || !pinchStartDist) return;
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      scale = Math.min(1.35, Math.max(0.65, pinchStartScale * (dist / pinchStartDist)));
      apply();
    },
    { passive: true }
  );

  stage.addEventListener("touchend", () => {
    pinchStartDist = 0;
  });

  stage.addEventListener("dblclick", (e) => {
    if (e.target.closest(".flow-bubble")) return;
    e.preventDefault();
    reset();
  });

  cluster.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastTap < 320) reset();
    lastTap = now;
  });

  return { reset, apply };
}

/**
 * Mobile-only Money Flow interaction — touch targets, bottom sheet, no desktop changes.
 * @param {object} ctx
 * @returns {() => void}
 */
export function bindFlowMapMobile(ctx) {
  const {
    map,
    cluster,
    stage,
    stageHit,
    bubbleEls,
    detailPanel,
    detailBody,
    detailClose,
    setFlowStory,
  } = ctx;

  map.classList.add("is-mobile");
  let focusedId = null;
  let detailPinned = false;
  let layoutRaf = 0;

  const runLayout = () => {
    cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(() => {
      applyMobileBubbleLayout(cluster, bubbleEls);
    });
  };

  runLayout();

  const viewport = bindFlowViewportGestures(map, cluster, stage);

  const showDetail = (id) => {
    const detail = getFlowIndustryDetail(id);
    const bubble = bubbleEls.find((b) => b.dataset.flowId === id);
    const pct = bubble ? Number(bubble.dataset.flowPct || bubble.style.getPropertyValue("--pct")) : null;
    if (!detailPanel || !detailBody || !detail) return;
    detailBody.innerHTML = renderFlowDetailContent(detail, { mobile: true, pct });
    detailPanel.hidden = false;
    detailPanel.removeAttribute("aria-hidden");
    map.classList.add("has-flow-detail");

    const cta = detailBody.querySelector("[data-flow-analysis]");
    cta?.addEventListener("click", () => {
      const sym = detail.examples[0]?.match(/\(([A-Z]+)\)/)?.[1];
      if (sym && typeof window.openTickerDeepDive === "function") {
        window.openTickerDeepDive({ symbol: sym, source: "flows", tab: "overview" });
      }
    });
  };

  const hideDetail = () => {
    if (!detailPanel) return;
    detailPanel.hidden = true;
    detailPanel.setAttribute("aria-hidden", "true");
    map.classList.remove("has-flow-detail", "is-detail-pinned");
    detailPinned = false;
  };

  const setFocus = (id) => {
    focusedId = id;
    cluster.classList.add("has-focus");
    bubbleEls.forEach((b) => {
      const on = b.dataset.flowId === id;
      b.classList.toggle("is-focused", on);
      b.style.zIndex = on ? "12" : "";
    });
    showDetail(id);
    setFlowStory(map, id);
  };

  const clearFocus = () => {
    focusedId = null;
    cluster.classList.remove("has-focus");
    bubbleEls.forEach((b) => {
      b.classList.remove("is-focused");
      b.style.zIndex = "";
    });
    hideDetail();
    setFlowStory(map, "default");
  };

  bubbleEls.forEach((bubble) => {
    const id = bubble.dataset.flowId;
    if (!id) return;

    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      if (focusedId === id && detailPinned) {
        clearFocus();
        return;
      }
      detailPinned = true;
      map.classList.add("is-detail-pinned");
      setFocus(id);
    });
  });

  detailClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFocus();
  });

  detailPanel?.addEventListener("click", (e) => e.stopPropagation());

  stageHit?.addEventListener("click", (e) => {
    if (e.target.closest(".flow-bubble") || e.target.closest("[data-flow-detail]")) return;
    if (detailPinned) clearFocus();
  });

  const onResize = () => {
    if (!isFlowMobileViewport()) return;
    runLayout();
    viewport.reset();
  };
  window.addEventListener("resize", onResize);

  return () => {
    cancelAnimationFrame(layoutRaf);
    window.removeEventListener("resize", onResize);
  };
}
