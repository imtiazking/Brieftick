/**
 * Mount inline vector wordmark into Variation 2 lockup slots.
 */
(function (global) {
  function mountWordmarks() {
    var svg = global.FQ2_WORDMARK_INLINE;
    if (!svg) return;
    document.querySelectorAll(".fq2-wordmark-mount:not([data-fq2-mounted])").forEach(function (el) {
      el.innerHTML = svg;
      el.setAttribute("data-fq2-mounted", "1");
    });
  }

  global.fq2MountWordmarks = mountWordmarks;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWordmarks);
  } else {
    mountWordmarks();
  }
})(window);
