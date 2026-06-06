/**
 * Brieftick onboarding tour — design-lab prototype only.
 * @module design-lab/onboarding-tour/onboarding-tour
 */

const MOBILE_BREAK = 640;
const PAD = 8;

/** @type {Array<{ id: string, navId: string, pageId: string, title: string, body: string, placement?: string, pill?: boolean }>} */
const BASE_STEPS = [
  {
    id: "dashboard",
    navId: "nav-dashboard",
    pageId: "page-dashboard",
    title: "Your market home base",
    body: "The Dashboard gives you a quick read on market mood, top movers, and what changed today — all in plain English.",
    placement: "bottom",
    pill: true,
  },
  {
    id: "logic",
    navId: "nav-logic",
    pageId: "page-logic",
    title: "Ask questions in plain English",
    body: "Logic turns your questions into clear answers. Try “Why is NVDA moving?” or “What should I watch this week?” — no jargon required.",
    placement: "bottom",
    pill: true,
  },
];

/** @type {{ discover: object, intelligence: object }} */
const STEP_THREE_VARIANTS = {
  discover: {
    id: "discover",
    navId: "nav-discover",
    pageId: "page-discover",
    title: "Find stocks that fit your style",
    body: "Discover helps you explore ideas by theme, sector, and momentum — a gentle way to spot names worth researching next.",
    placement: "bottom",
    pill: true,
  },
  intelligence: {
    id: "intelligence",
    navId: "nav-intelligence",
    pageId: "page-intelligence",
    title: "Go deeper when you're ready",
    body: "Intelligence layers news, flows, and context together — for when you want the full story behind a move, not just the headline.",
    placement: "bottom",
    pill: true,
  },
};

const els = {
  overlay: document.getElementById("tourOverlay"),
  spotlight: document.getElementById("tourSpotlight"),
  arrow: document.getElementById("tourArrow"),
  card: document.getElementById("tourCard"),
  dots: document.getElementById("tourDots"),
  stepLabel: document.getElementById("tourStepLabel"),
  title: document.getElementById("tourTitle"),
  body: document.getElementById("tourBody"),
  skip: document.getElementById("tourSkip"),
  next: document.getElementById("tourNext"),
  finishBanner: document.getElementById("tourFinishBanner"),
  restart: document.getElementById("tourRestart"),
  variantDiscover: document.getElementById("variantDiscover"),
  variantIntel: document.getElementById("variantIntelligence"),
  navLinks: [...document.querySelectorAll(".mock-nav__link")],
  pages: [...document.querySelectorAll(".mock-page")],
};

let stepIndex = 0;
let stepThreeVariant = "discover";
let open = false;

function getSteps() {
  return [...BASE_STEPS, STEP_THREE_VARIANTS[stepThreeVariant]];
}

function isMobile() {
  return window.innerWidth <= MOBILE_BREAK;
}

function setActivePage(pageId) {
  els.pages.forEach((p) => p.classList.toggle("is-active", p.id === pageId));
  els.navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.id === getSteps()[stepIndex]?.navId);
  });
}

function renderDots(total, active) {
  els.dots.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = "tour-card__dot";
    if (i < active) dot.classList.add("is-done");
    if (i === active) dot.classList.add("is-active");
    dot.setAttribute("aria-hidden", "true");
    els.dots.appendChild(dot);
  }
}

function getTargetEl(step) {
  return document.getElementById(step.navId);
}

function positionSpotlight(rect, pill) {
  const top = Math.max(0, rect.top - PAD);
  const left = Math.max(0, rect.left - PAD);
  const width = rect.width + PAD * 2;
  const height = rect.height + PAD * 2;

  els.spotlight.style.top = `${top}px`;
  els.spotlight.style.left = `${left}px`;
  els.spotlight.style.width = `${width}px`;
  els.spotlight.style.height = `${height}px`;
  els.spotlight.classList.toggle("tour-spotlight--pill", !!pill);

  return { top, left, width, height };
}

function positionCard(targetBox, placement) {
  const card = els.card;
  const gap = 14;
  const margin = 12;
  const cardRect = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  card.classList.remove("tour-card--mobile-sheet");
  els.arrow.classList.remove("tour-arrow--hidden");

  if (isMobile()) {
    card.classList.add("tour-card--mobile-sheet");
    els.arrow.classList.add("tour-arrow--hidden");
    return;
  }

  let top;
  let left;
  let arrowTop;
  let arrowLeft;
  let arrowVisible = true;

  const preferBelow = placement !== "top";
  const spaceBelow = vh - (targetBox.top + targetBox.height);
  const spaceAbove = targetBox.top;
  const placeBelow = preferBelow ? spaceBelow >= cardRect.height + gap + 20 : false;
  const placeAbove = !placeBelow && spaceAbove >= cardRect.height + gap + 20;

  if (placeBelow) {
    top = targetBox.top + targetBox.height + gap;
    arrowTop = top - 10;
  } else if (placeAbove) {
    top = targetBox.top - cardRect.height - gap;
    arrowTop = top + cardRect.height - 8;
  } else {
    top = Math.min(vh - cardRect.height - margin, targetBox.top + targetBox.height + gap);
    arrowVisible = false;
  }

  left = targetBox.left + targetBox.width / 2 - cardRect.width / 2;
  left = Math.max(margin, Math.min(left, vw - cardRect.width - margin));

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.transform = "none";

  if (arrowVisible) {
    arrowLeft = targetBox.left + targetBox.width / 2 - 9;
    els.arrow.style.top = `${arrowTop}px`;
    els.arrow.style.left = `${arrowLeft}px`;
  } else {
    els.arrow.classList.add("tour-arrow--hidden");
  }
}

function highlightTarget(step) {
  els.navLinks.forEach((link) => link.classList.remove("is-tour-target"));
  const target = getTargetEl(step);
  if (target) target.classList.add("is-tour-target");
}

function showStep(index) {
  const steps = getSteps();
  const step = steps[index];
  if (!step) return;

  stepIndex = index;
  setActivePage(step.pageId);
  highlightTarget(step);

  const target = getTargetEl(step);
  if (!target) return;

  target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });

  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const box = positionSpotlight(rect, step.pill);

    els.title.textContent = step.title;
    els.body.textContent = step.body;
    renderDots(steps.length, index);
    els.stepLabel.textContent = `Step ${index + 1} of ${steps.length}`;

    const isLast = index === steps.length - 1;
    els.next.textContent = isLast ? "Finish" : "Next";

    requestAnimationFrame(() => positionCard(box, step.placement));
  });
}

function openTour(fromStep = 0) {
  open = true;
  els.finishBanner.classList.remove("is-visible");
  els.overlay.classList.remove("is-dismissed");
  els.overlay.classList.add("is-open");
  els.overlay.setAttribute("aria-hidden", "false");
  showStep(fromStep);
}

function closeTour(showFinish = false) {
  open = false;
  els.overlay.classList.remove("is-open");
  els.overlay.classList.add("is-dismissed");
  els.overlay.setAttribute("aria-hidden", "true");
  els.navLinks.forEach((link) => link.classList.remove("is-tour-target"));
  if (showFinish) {
    els.finishBanner.classList.add("is-visible");
  }
}

function setVariant(variant) {
  stepThreeVariant = variant;
  els.variantDiscover?.classList.toggle("is-active", variant === "discover");
  els.variantIntel?.classList.toggle("is-active", variant === "intelligence");

  const discoverNav = document.getElementById("nav-discover");
  const intelNav = document.getElementById("nav-intelligence");
  if (discoverNav) discoverNav.hidden = variant !== "discover";
  if (intelNav) intelNav.hidden = variant !== "intelligence";

  if (open && stepIndex === 2) showStep(2);
}

function onNext() {
  const steps = getSteps();
  if (stepIndex >= steps.length - 1) {
    closeTour(true);
    return;
  }
  showStep(stepIndex + 1);
}

function onResize() {
  if (!open) return;
  showStep(stepIndex);
}

els.skip?.addEventListener("click", () => closeTour(false));
els.next?.addEventListener("click", onNext);
els.restart?.addEventListener("click", () => openTour(0));
els.finishBanner?.querySelector("button")?.addEventListener("click", () => {
  els.finishBanner.classList.remove("is-visible");
});

els.variantDiscover?.addEventListener("click", () => setVariant("discover"));
els.variantIntel?.addEventListener("click", () => setVariant("intelligence"));

els.navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (open) return;
    const pageId = link.dataset.page;
    if (pageId) {
      els.pages.forEach((p) => p.classList.toggle("is-active", p.id === pageId));
      els.navLinks.forEach((l) => l.classList.toggle("is-active", l === link));
    }
  });
});

window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);

document.addEventListener("keydown", (e) => {
  if (!open) return;
  if (e.key === "Escape") closeTour(false);
  if (e.key === "Enter") onNext();
});

setVariant("discover");
openTour(0);
