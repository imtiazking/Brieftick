/**
 * Preview-only: stacked Variation 2 (symbol centred above vector wordmark).
 */
(function logoVariation2(global) {
  const SYMBOL_SRC = "/brand/forgeniq-symbol-white.png";

  const WORDMARK = `
        <span class="fq2-logo-stacked__wordmark">
          ${global.FQ2_WORDMARK_INLINE || `<img class="fq2-logo-stacked__wordmark-svg" src="/debug/logo-variation-2-preview/forgeniq-wordmark.svg" alt="FORGENIQ" width="10364" height="1750" decoding="async">`}
        </span>`;

  const STACKED = (cls) => `
      <div class="fq2-logo-stacked ${cls}" role="img" aria-label="FORGENIQ">
        <span class="fq2-logo-stacked__symbol">
          <img src="${SYMBOL_SRC}" alt="" width="474" height="474" decoding="async">
        </span>
        ${WORDMARK}
      </div>`;

  function stackedMarkup(variant) {
    return STACKED(variant);
  }

  function replaceNavBrand(variant) {
    const brand = document.getElementById("navBrand");
    if (!brand) return false;
    brand.classList.add("fq2-variation-preview");
    brand.innerHTML = stackedMarkup(variant);
    return true;
  }

  function replaceFooterLogo() {
    const footerImg = document.querySelector("footer img[src*='forgeniq-logo']");
    if (!footerImg) return false;
    const wrap = document.createElement("div");
    wrap.className = "fq2-variation-preview";
    wrap.innerHTML = stackedMarkup("fq2-logo-stacked--footer");
    footerImg.replaceWith(wrap.firstElementChild);
    return true;
  }

  function replaceDashboardLogo() {
    const brand = document.querySelector(".dash-preview-chrome .split-brand, .dash-preview-chrome .brand");
    if (brand) {
      brand.classList.add("fq2-variation-preview");
      brand.innerHTML = stackedMarkup("fq2-logo-stacked--nav-dashboard");
      return true;
    }
    const img = document.querySelector(".dash-preview-chrome img[src*='forgeniq-logo']");
    if (img) {
      const wrap = document.createElement("div");
      wrap.className = "fq2-variation-preview";
      wrap.innerHTML = stackedMarkup("fq2-logo-stacked--nav-dashboard");
      img.replaceWith(wrap.firstElementChild);
      return true;
    }
    return false;
  }

  function replaceRaModalLogo() {
    const img = document.querySelector("#raModal img[src*='forgeniq-logo']");
    if (!img) return false;
    const wrap = document.createElement("div");
    wrap.className = "fq2-variation-preview";
    wrap.style.marginBottom = "18px";
    wrap.innerHTML = stackedMarkup("fq2-logo-stacked--standalone-sm");
    img.replaceWith(wrap.firstElementChild);
    return true;
  }

  function injectStylesheet() {
    if (document.getElementById("fq2-logo-variation-css")) return;
    const link = document.createElement("link");
    link.id = "fq2-logo-variation-css";
    link.rel = "stylesheet";
    link.href = "/debug/logo-variation-2-preview/logo-variation-2.css";
    document.head.appendChild(link);
  }

  function applyVariation(options = {}) {
    const { context = "marketing", navVariant = "fq2-logo-stacked--nav-marketing" } = options;
    injectStylesheet();
    document.documentElement.classList.add("fq2-variation-preview-active");

    if (context === "footer") return replaceFooterLogo();
    if (context === "dashboard") return replaceDashboardLogo();
    if (context === "auth") return replaceRaModalLogo();

    const mobile = global.innerWidth <= 480;
    const variant = navVariant || (mobile ? "fq2-logo-stacked--nav-mobile" : "fq2-logo-stacked--nav-marketing");
    return replaceNavBrand(variant);
  }

  global.FqLogoVariation2 = {
    applyVariation,
    stackedMarkup,
    injectStylesheet,
    ensureFontsReady: () => Promise.resolve(),
  };
})(window);
