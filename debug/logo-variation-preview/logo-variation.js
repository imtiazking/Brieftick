/**
 * Preview-only: swap horizontal lockup for stacked Variation 1 (vector wordmark).
 * Loaded by capture script or debug pages — never on production.
 */
(function logoVariation(global) {
  const WORDMARK_SVG = `
        <span class="fq-logo-stacked__wordmark">
          <img class="fq-logo-stacked__wordmark-svg" src="/debug/logo-variation-preview/forgeniq-wordmark.svg" alt="FORGENIQ" width="10101" height="2048" decoding="async">
        </span>`;

  const STACKED_HTML = {
    marketing: (cls) => `
      <div class="fq-logo-stacked ${cls}" role="img" aria-label="FORGENIQ">
        <span class="fq-logo-stacked__symbol">
          <img src="/brand/forgeniq-symbol-white.png" alt="" width="474" height="474" decoding="async">
        </span>
        ${WORDMARK_SVG}
      </div>`,
  };

  function stackedMarkup(variant) {
    return STACKED_HTML.marketing(variant);
  }

  function replaceNavBrand(variant) {
    const brand = document.getElementById("navBrand");
    if (!brand) return false;
    brand.classList.add("fq-variation-preview");
    brand.innerHTML = stackedMarkup(variant);
    return true;
  }

  function replaceFooterLogo() {
    const footerImg = document.querySelector("footer img[src*='forgeniq-logo']");
    if (!footerImg) return false;
    const wrap = document.createElement("div");
    wrap.className = "fq-variation-preview";
    wrap.innerHTML = stackedMarkup("fq-logo-stacked--footer");
    footerImg.replaceWith(wrap.firstElementChild);
    return true;
  }

  function replaceDashboardLogo() {
    const brand = document.querySelector(".dash-preview-chrome .split-brand, .dash-preview-chrome .brand");
    if (brand) {
      brand.classList.add("fq-variation-preview");
      brand.innerHTML = stackedMarkup("fq-logo-stacked--nav-dashboard");
      return true;
    }
    const img = document.querySelector(".dash-preview-chrome img[src*='forgeniq-logo']");
    if (img) {
      const wrap = document.createElement("div");
      wrap.className = "fq-variation-preview";
      wrap.innerHTML = stackedMarkup("fq-logo-stacked--nav-dashboard");
      img.replaceWith(wrap.firstElementChild);
      return true;
    }
    return false;
  }

  function replaceRaModalLogo() {
    const img = document.querySelector("#raModal img[src*='forgeniq-logo']");
    if (!img) return false;
    const wrap = document.createElement("div");
    wrap.className = "fq-variation-preview";
    wrap.style.marginBottom = "18px";
    wrap.innerHTML = stackedMarkup("fq-logo-stacked--standalone-sm");
    img.replaceWith(wrap.firstElementChild);
    return true;
  }

  function injectStylesheet() {
    if (document.getElementById("fq-logo-variation-css")) return;
    const link = document.createElement("link");
    link.id = "fq-logo-variation-css";
    link.rel = "stylesheet";
    link.href = "/debug/logo-variation-preview/logo-variation.css";
    document.head.appendChild(link);
  }

  async function ensureFontsReady() {
    return Promise.resolve();
  }

  function applyVariation(options = {}) {
    const { context = "marketing", navVariant = "fq-logo-stacked--nav-marketing" } = options;
    injectStylesheet();
    document.documentElement.classList.add("fq-variation-preview-active");
    ensureFontsReady();

    if (context === "footer") return replaceFooterLogo();
    if (context === "dashboard") return replaceDashboardLogo();
    if (context === "auth") return replaceRaModalLogo();

    const mobile = global.innerWidth <= 480;
    const variant = navVariant || (mobile ? "fq-logo-stacked--nav-mobile" : "fq-logo-stacked--nav-marketing");
    return replaceNavBrand(variant);
  }

  function logoSelector() {
    return "#navBrand .fq-logo-stacked, #navBrand .split-brand-img--full, footer .fq-logo-stacked, .dash-preview-chrome .fq-logo-stacked, .fq-logo-stacked--standalone";
  }

  global.FqLogoVariation = {
    applyVariation,
    stackedMarkup,
    logoSelector,
    injectStylesheet,
    ensureFontsReady,
  };
})(window);
