/**
 * Shared 3-step onboarding copy — design lab only.
 * @module design-lab/onboarding-tour/shared-steps
 */

/** @typedef {{ id: string, navId: string, pageId: string, title: string, body: string, pill?: boolean }} TourStep */

/** @type {TourStep[]} */
export const STEPS_DEFAULT = [
  {
    id: "dashboard",
    navId: "nav-dashboard",
    pageId: "page-dashboard",
    title: "Your daily market home base",
    body: "Start on the Dashboard for market mood, top movers, and what changed today — all in plain English.",
    pill: true,
  },
  {
    id: "logic",
    navId: "nav-logic",
    pageId: "page-logic",
    title: "Ask market questions in plain English",
    body: "Logic answers beginner-friendly questions like “Why is NVDA moving?” without Wall Street jargon.",
    pill: true,
  },
];

/** @type {{ discover: TourStep, intelligence: TourStep }} */
export const STEP_THREE = {
  discover: {
    id: "discover",
    navId: "nav-discover",
    pageId: "page-discover",
    title: "Find ideas worth exploring",
    body: "Discover surfaces themes and stocks when you do not have a ticker in mind yet — a gentle next step after the Dashboard.",
    pill: true,
  },
  intelligence: {
    id: "intelligence",
    navId: "nav-intelligence",
    pageId: "page-intelligence",
    title: "Go deeper on the story",
    body: "Intelligence weaves news, flows, and context together — for when you want the full picture beneath the headline.",
    pill: true,
  },
};

/** Market Guide — premium institutional framing */
/** @type {TourStep[]} */
export const STEPS_MARKET_GUIDE = [
  {
    id: "dashboard",
    navId: "nav-dashboard",
    pageId: "page-dashboard",
    title: "Read the market",
    body: "Your Dashboard is the morning brief — regime, leadership, and what shifted on the tape, distilled for quick orientation.",
    pill: true,
  },
  {
    id: "logic",
    navId: "nav-logic",
    pageId: "page-logic",
    title: "Ask the market",
    body: "Logic is your research desk in conversation form. Pose a question; receive context grounded in live conditions.",
    pill: true,
  },
  {
    id: "discover",
    navId: "nav-discover",
    pageId: "page-discover",
    title: "Find the story",
    body: "Discover maps themes and narratives beneath the headlines — where sector rotation and momentum intersect.",
    pill: true,
  },
];

/**
 * @param {'default' | 'market'} copySet
 * @param {'discover' | 'intelligence'} stepThree
 * @returns {TourStep[]}
 */
export function getSteps(copySet, stepThree = "discover") {
  if (copySet === "market") {
    const third =
      stepThree === "intelligence"
        ? {
            ...STEP_THREE.intelligence,
            title: "Find the story",
            body: "Intelligence connects flows, news stress, and narrative context — the institutional view beneath the headline.",
          }
        : STEPS_MARKET_GUIDE[2];
    return [STEPS_MARKET_GUIDE[0], STEPS_MARKET_GUIDE[1], third];
  }
  return [...STEPS_DEFAULT, STEP_THREE[stepThree]];
}
