/**
 * Intelligence Wheel — drag (inertia) vs click/keyboard (eased glide, no overshoot).
 * @module preview/dashboard-design-wheel
 */

/** Must match .intel-wheel__chip width in CSS (same as .intel-wheel__focus) */
const SLOT_WIDTH = 148;
const FRICTION = 0.9;
const INERTIA_STOP = 0.45;
const CLICK_DRAG_THRESHOLD = 8;
const CLICK_GLIDE_MS = 360;

/** @typedef {'idle' | 'drag' | 'inertia' | 'click'} MotionMode */

/**
 * @param {HTMLElement} viewport
 * @param {{ id: string, label: string }[]} categories
 * @param {{ onActiveChange: (id: string) => void, initialId?: string }} options
 */
export function createIntelligenceWheel(viewport, categories, options) {
  const track = document.createElement("div");
  track.className = "intel-wheel__track";
  track.setAttribute("role", "listbox");
  track.setAttribute("aria-label", "Intelligence channels");

  const chips = categories.map((cat, i) => {
    const el = document.createElement("span");
    el.className = "intel-wheel__chip";
    el.dataset.wheelId = cat.id;
    el.dataset.wheelIndex = String(i);
    const label = document.createElement("span");
    label.className = "intel-wheel__chip-label";
    label.textContent = cat.label;
    el.appendChild(label);
    el.setAttribute("role", "option");
    el.tabIndex = -1;
    track.appendChild(el);
    return el;
  });

  const focusRing = document.createElement("div");
  focusRing.className = "intel-wheel__focus";
  focusRing.setAttribute("aria-hidden", "true");

  viewport.innerHTML = "";
  viewport.appendChild(track);
  viewport.appendChild(focusRing);

  let offset = 0;
  let velocity = 0;
  /** @type {MotionMode} */
  let motionMode = "idle";
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let activeIndex = 0;
  let dragTotal = 0;
  let pressIndex = null;
  let lastT = 0;
  let rafId = 0;
  let destroyed = false;

  let clickTargetIndex = null;
  let clickFromOffset = 0;
  let clickStartTime = 0;

  function slotWidth() {
    const w = chips[0]?.offsetWidth;
    return w && w > 0 ? w : SLOT_WIDTH;
  }

  function padding() {
    return viewport.clientWidth / 2 - slotWidth() / 2;
  }

  function indexToOffset(i) {
    return -i * slotWidth();
  }

  function offsetToIndex(off) {
    return Math.round(-off / slotWidth());
  }

  function clampOffset(off) {
    const min = indexToOffset(categories.length - 1);
    return Math.max(min, Math.min(0, off));
  }

  function clampIndex(i) {
    return Math.max(0, Math.min(categories.length - 1, i));
  }

  function fractionalIndex() {
    return -offset / slotWidth();
  }

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  /** Pixel-lock chip centre to viewport centre (fixes font/scale drift) */
  function lockIndexToCenter(i) {
    const chip = chips[clampIndex(i)];
    if (!chip) return;
    const vRect = viewport.getBoundingClientRect();
    const viewportCenter = vRect.left + vRect.width / 2;
    const chipRect = chip.getBoundingClientRect();
    const chipCenter = chipRect.left + chipRect.width / 2;
    offset += viewportCenter - chipCenter;
    offset = clampOffset(offset);
  }

  function commitActive(i) {
    const clamped = clampIndex(i);
    if (clamped === activeIndex) return;
    activeIndex = clamped;
    options.onActiveChange(categories[clamped].id);
  }

  function updateChipVisuals() {
    const frac = fractionalIndex();
    chips.forEach((chip, i) => {
      const label = chip.querySelector(".intel-wheel__chip-label");
      if (!label) return;
      const d = Math.abs(i - frac);
      const scale = d < 1 ? 1 - d * 0.14 : Math.max(0.58, 0.86 - d * 0.12);
      const opacity = d < 1 ? 1 - d * 0.42 : Math.max(0.08, 0.48 - d * 0.15);
      label.style.transform = `scale(${scale.toFixed(3)})`;
      label.style.opacity = String(opacity.toFixed(3));
      const centered =
        motionMode === "click" && clickTargetIndex !== null
          ? i === clickTargetIndex
          : d < 0.35;
      chip.classList.toggle("is-centered", centered);
      chip.setAttribute("aria-selected", centered ? "true" : "false");
    });
    track.style.transform = `translate3d(${offset + padding()}px, 0, 0)`;
  }

  function finishSnap(i) {
    offset = indexToOffset(i);
    velocity = 0;
    activeIndex = i;
    updateChipVisuals();
    requestAnimationFrame(() => {
      lockIndexToCenter(i);
      updateChipVisuals();
    });
  }

  function startClickGlide(i) {
    const target = clampIndex(i);
    const targetOffset = indexToOffset(target);

    if (Math.abs(offset - targetOffset) < 0.5) {
      motionMode = "idle";
      clickTargetIndex = null;
      commitActive(target);
      finishSnap(target);
      return;
    }

    motionMode = "click";
    velocity = 0;
    clickTargetIndex = target;
    clickFromOffset = offset;
    clickStartTime = performance.now();
    commitActive(target);
  }

  function tickClick(now) {
    const elapsed = now - clickStartTime;
    const t = Math.min(1, elapsed / CLICK_GLIDE_MS);
    const eased = easeOutCubic(t);
    const targetOffset = indexToOffset(clickTargetIndex);
    offset = clickFromOffset + (targetOffset - clickFromOffset) * eased;

    if (t >= 1) {
      clickTargetIndex = null;
      motionMode = "idle";
      finishSnap(activeIndex);
    }
  }

  function tickInertia() {
    if (Math.abs(velocity) <= INERTIA_STOP) {
      velocity = 0;
      const nearest = clampIndex(offsetToIndex(offset));
      startClickGlide(nearest);
      return;
    }
    offset += velocity;
    offset = clampOffset(offset);
    velocity *= FRICTION;
    if (
      (offset === 0 && velocity > 0) ||
      (offset === indexToOffset(categories.length - 1) && velocity < 0)
    ) {
      velocity *= 0.5;
    }
    const idx = clampIndex(offsetToIndex(offset));
    if (idx !== activeIndex) commitActive(idx);
  }

  function tick() {
    if (destroyed) return;
    const now = performance.now();

    if (!dragging) {
      if (motionMode === "click" && clickTargetIndex !== null) {
        tickClick(now);
      } else if (motionMode === "inertia") {
        tickInertia();
      }
    }

    updateChipVisuals();
    rafId = requestAnimationFrame(tick);
  }

  function chipIndexAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const chip = el?.closest?.(".intel-wheel__chip");
    if (!chip || !viewport.contains(chip)) return null;
    const i = Number(chip.dataset.wheelIndex);
    return Number.isFinite(i) ? i : null;
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    motionMode = "drag";
    clickTargetIndex = null;
    velocity = 0;
    dragTotal = 0;
    pressIndex = chipIndexAt(e.clientX, e.clientY);
    pointerId = e.pointerId;
    lastX = e.clientX;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    dragTotal += Math.abs(dx);
    if (dragTotal >= CLICK_DRAG_THRESHOLD) {
      motionMode = "drag";
      clickTargetIndex = null;
    }
    const now = performance.now();
    const dt = Math.max(now - (lastT || now), 1);
    offset += dx;
    offset = clampOffset(offset);
    velocity = (dx / dt) * 14;
    lastX = e.clientX;
    lastT = now;
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    viewport.classList.remove("is-dragging");
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* released */
    }

    const tapped =
      dragTotal < CLICK_DRAG_THRESHOLD
        ? pressIndex ?? chipIndexAt(e.clientX, e.clientY)
        : null;

    pressIndex = null;

    if (tapped !== null) {
      startClickGlide(tapped);
      return;
    }

    motionMode = "inertia";
  }

  function onKeyDown(e) {
    if (!viewport.closest(".dash-lab-panel.is-active")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      startClickGlide(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      startClickGlide(activeIndex + 1);
    }
  }

  function onResize() {
    finishSnap(activeIndex);
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);

  const initialIdx = clampIndex(
    Math.max(0, categories.findIndex((c) => c.id === (options.initialId || "movers")))
  );
  activeIndex = initialIdx;
  offset = indexToOffset(initialIdx);
  updateChipVisuals();
  requestAnimationFrame(() => finishSnap(initialIdx));
  rafId = requestAnimationFrame(tick);

  return {
    glideToIndex: startClickGlide,
    setActive(id, animated = true) {
      const i = categories.findIndex((c) => c.id === id);
      if (i < 0) return;
      if (animated) startClickGlide(i);
      else {
        const clamped = clampIndex(i);
        clickTargetIndex = null;
        motionMode = "idle";
        activeIndex = clamped;
        commitActive(clamped);
        finishSnap(clamped);
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    },
  };
}
