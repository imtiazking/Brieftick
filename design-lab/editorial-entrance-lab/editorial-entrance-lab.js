/**
 * Concept 36 — Editorial Entrance Lab
 * Switch entrance animation only; production Minimal typography stays locked.
 */
(function () {
  const STORAGE_KEY = "brieftick-editorial-entrance-winner";
  const root = document.documentElement;
  const buttons = document.querySelectorAll("[data-eel-variant]");
  const winnerBtn = document.getElementById("eelWinner");
  const winnerNote = document.getElementById("eelWinnerNote");
  const masthead = document.querySelector(".eel-masthead");
  const valid = new Set([...buttons].map((btn) => btn.dataset.eelVariant));

  function replayHeadline() {
    const headline = masthead?.querySelector(".eel-headline");
    if (!headline) return;
    const fresh = headline.cloneNode(true);
    headline.replaceWith(fresh);
  }

  function setVariant(id, replay) {
    if (!valid.has(id)) return;
    root.dataset.eelVariant = id;
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.eelVariant === id);
    });
    history.replaceState(null, "", `#${id}`);
    if (replay !== false) {
      requestAnimationFrame(() => replayHeadline());
    }
    updateWinnerUi();
  }

  function updateWinnerUi() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const current = root.dataset.eelVariant;
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
    btn.addEventListener("click", () => setVariant(btn.dataset.eelVariant));
  });

  winnerBtn?.addEventListener("click", () => {
    const current = root.dataset.eelVariant;
    if (!valid.has(current)) return;
    localStorage.setItem(STORAGE_KEY, current);
    updateWinnerUi();
  });

  const hash = location.hash.replace("#", "");
  if (hash && valid.has(hash)) {
    setVariant(hash, false);
    requestAnimationFrame(() => replayHeadline());
  } else {
    updateWinnerUi();
    requestAnimationFrame(() => replayHeadline());
  }
})();
