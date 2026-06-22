/**
 * Concept 34 — Luxury Editorial Font Lab
 * Switch font only; composition stays locked to Concept C.
 */
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-lefl-font]");
  const valid = new Set([...buttons].map((btn) => btn.dataset.leflFont));

  function setFont(id) {
    if (!valid.has(id)) return;
    root.dataset.leflFont = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.leflFont === id);
    });
    history.replaceState(null, "", `#${id}`);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setFont(btn.dataset.leflFont));
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setFont(hash);
  }
})();
