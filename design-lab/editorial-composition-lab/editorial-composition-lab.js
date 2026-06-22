/**
 * Concept 35 — Editorial Composition Lab
 * Switch composition only; Bodoni Moda display light stays locked.
 */
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-ecl-variant]");
  const valid = new Set([...buttons].map((btn) => btn.dataset.eclVariant));

  function setVariant(id) {
    if (!valid.has(id)) return;
    root.dataset.eclVariant = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.eclVariant === id);
    });
    history.replaceState(null, "", `#${id}`);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setVariant(btn.dataset.eclVariant));
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setVariant(hash);
  }
})();
