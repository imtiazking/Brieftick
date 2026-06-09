/**
 * Concept 28 — Editorial Intelligence · version switcher
 */
(function () {
  const buttons = document.querySelectorAll("[data-ei-version]");
  const panels = document.querySelectorAll("[data-ei-panel]");

  function showVersion(id) {
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.eiVersion === id);
    });
    panels.forEach((panel) => {
      const active = panel.dataset.eiPanel === id;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      showVersion(btn.dataset.eiVersion);
    });
  });
})();
