/**
 * Concept 30 — Editorial Typeface Lab
 * Switch typeface only; composition stays locked to Concept C.
 */
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-etl-font]");
  const valid = new Set([...buttons].map((btn) => btn.dataset.etlFont));

  function setFont(id) {
    if (!valid.has(id)) return;
    root.dataset.etlFont = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.etlFont === id);
    });
    history.replaceState(null, "", `#${id}`);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setFont(btn.dataset.etlFont));
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setFont(hash);
  }
})();
