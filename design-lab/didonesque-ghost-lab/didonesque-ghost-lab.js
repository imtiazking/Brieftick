/**
 * Concept 31 — Didonesque Ghost Lab
 * Switch editorial treatment; font and composition stay locked.
 */
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-dgl-variant]");
  const valid = new Set([...buttons].map((btn) => btn.dataset.dglVariant));

  function setVariant(id) {
    if (!valid.has(id)) return;
    root.dataset.dglVariant = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.dglVariant === id);
    });
    history.replaceState(null, "", `#${id}`);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setVariant(btn.dataset.dglVariant));
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setVariant(hash);
  }
})();
