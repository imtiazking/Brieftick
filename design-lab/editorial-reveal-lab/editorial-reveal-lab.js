/**
 * Concept 37 — Editorial Reveal Lab
 * Switch reveal animation only; production Minimal typography stays locked.
 */
(function () {
  const STORAGE_KEY = "brieftick-editorial-reveal-winner";
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-erl-variant]");
  const winnerBtn = document.getElementById("erlWinner");
  const winnerNote = document.getElementById("erlWinnerNote");
  const masthead = document.querySelector(".erl-masthead");
  const valid = new Set([...buttons].map((btn) => btn.dataset.erlVariant));

  function replayStage() {
    const stage = masthead?.querySelector(".erl-reveal-stage");
    if (!stage) return;
    const fresh = stage.cloneNode(true);
    stage.replaceWith(fresh);
  }

  function setVariant(id, replay) {
    if (!valid.has(id)) return;
    root.dataset.erlVariant = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.erlVariant === id);
    });
    history.replaceState(null, "", `#${id}`);
    if (replay !== false) {
      requestAnimationFrame(() => replayStage());
    }
    updateWinnerUi();
  }

  function updateWinnerUi() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const current = root.dataset.erlVariant;
    const isWinner = saved === current;

    if (winnerBtn) {
      winnerBtn.classList.toggle("is-saved", isWinner);
      winnerBtn.setAttribute("aria-pressed", String(isWinner));
    }

    if (winnerNote) {
      if (saved && valid.has(saved)) {
        winnerNote.hidden = false;
        winnerNote.textContent = isWinner ? "Saved as winner" : `Winner: ${saved.toUpperCase()}`;
      } else {
        winnerNote.hidden = true;
        winnerNote.textContent = "";
      }
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => setVariant(btn.dataset.erlVariant));
  });

  winnerBtn?.addEventListener("click", () => {
    const current = root.dataset.erlVariant;
    if (!valid.has(current)) return;
    localStorage.setItem(STORAGE_KEY, current);
    updateWinnerUi();
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setVariant(hash, false);
    requestAnimationFrame(() => replayStage());
  } else {
    updateWinnerUi();
    requestAnimationFrame(() => replayStage());
  }
})();
