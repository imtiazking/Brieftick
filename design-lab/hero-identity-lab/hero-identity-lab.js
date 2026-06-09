/**
 * Concept 29 — Hero Identity Lab
 * Concept switcher with hash deep-linking (#1 … #8)
 */
(function () {
  const buttons = document.querySelectorAll("[data-hil-concept]");
  const panels = document.querySelectorAll("[data-hil-panel]");

  function showConcept(id) {
    const key = String(id);
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.hilConcept === key);
    });
    panels.forEach((panel) => {
      const active = panel.dataset.hilPanel === key;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    history.replaceState(null, "", `#${key}`);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showConcept(btn.dataset.hilConcept));
  });

  const hash = location.hash.replace("#", "");
  if (hash && panels.length && document.querySelector(`[data-hil-panel="${hash}"]`)) {
    showConcept(hash);
  }
})();
