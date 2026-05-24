/**
 * Dia Text Reveal — nav brand preview (static icon + animated wordmark).
 * Activate with: ?preview=dia-text-reveal
 * Mirrors components/dia-text-reveal.tsx via framer-motion/dom (no React).
 */
(function () {
  const PREVIEW_KEY = "dia-text-reveal";
  if (new URLSearchParams(location.search).get("preview") !== PREVIEW_KEY) return;

  document.documentElement.classList.add("preview-dia-text-reveal");

  const BLUE_PURPLE_COLORS = ["#4ea8ff", "#6b7dff", "#8b5cf6", "#a855f7", "#6366f1"];
  const TEXT_COLOR = "#e8ecf5";
  const BAND_HALF = 17;
  const SWEEP_START = -BAND_HALF;
  const SWEEP_END = 100 + BAND_HALF;

  const sweepEase = (t) =>
    t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

  function buildGradient(pos, colors, textColor) {
    const bandStart = pos - BAND_HALF;
    const bandEnd = pos + BAND_HALF;
    if (bandStart >= 100) {
      return `linear-gradient(90deg, ${textColor}, ${textColor})`;
    }
    const n = colors.length;
    const parts = [];
    if (bandStart > 0) {
      parts.push(`${textColor} 0%`, `${textColor} ${bandStart.toFixed(2)}%`);
    }
    colors.forEach((c, i) => {
      const pct = n === 1 ? pos : bandStart + (i / (n - 1)) * BAND_HALF * 2;
      parts.push(`${c} ${pct.toFixed(2)}%`);
    });
    if (bandEnd < 100) {
      parts.push(`transparent ${bandEnd.toFixed(2)}%`, `transparent 100%`);
    }
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  }

  function applyDiaStyles(el, pos) {
    el.style.color = "transparent";
    el.style.backgroundClip = "text";
    el.style.webkitBackgroundClip = "text";
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundImage = buildGradient(pos, BLUE_PURPLE_COLORS, TEXT_COLOR);
  }

  async function playDiaReveal(el) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyDiaStyles(el, SWEEP_END);
      el.style.color = TEXT_COLOR;
      el.style.backgroundImage = "none";
      return;
    }
    let animate;
    try {
      ({ animate } = await import("https://esm.sh/framer-motion@12/dom"));
    } catch (e) {
      console.warn("[dia-text-reveal] framer-motion unavailable", e);
      el.style.color = TEXT_COLOR;
      return;
    }
    const state = { pos: SWEEP_START };
    applyDiaStyles(el, state.pos);
    animate(state, { pos: SWEEP_END }, {
      duration: 1.5,
      delay: 0.25,
      ease: sweepEase,
      onUpdate: () => applyDiaStyles(el, state.pos),
      onComplete: () => applyDiaStyles(el, SWEEP_END),
    });
  }

  function mountBrandPreview() {
    const brand = document.getElementById("navBrand");
    if (!brand || brand.dataset.diaPreviewMounted === "1") return;
    brand.dataset.diaPreviewMounted = "1";

    brand.innerHTML = `
      <span class="brand-mark" aria-hidden="false">
        <img src="/logo-symbol-transparent.png" alt="" width="42" height="42" style="width:42px;height:auto;display:block;object-fit:contain" />
      </span>
      <span class="brand-name dia-brand-text" id="diaBrandText">brieftick</span>
    `;

    const textEl = document.getElementById("diaBrandText");
    if (textEl) playDiaReveal(textEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBrandPreview);
  } else {
    mountBrandPreview();
  }
  window.addEventListener("load", () => setTimeout(mountBrandPreview, 100));
})();
