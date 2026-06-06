/**
 * Shared onboarding content — design lab only.
 * Same three destinations, different philosophies per concept.
 * @module design-lab/onboarding-tour/shared-steps
 */

/** @typedef {{ id: string, navId: string, pageId: string, title: string, body: string, short?: string, action?: string }} TourStep */

/** @type {TourStep[]} */
export const CORE = [
  {
    id: "dashboard",
    navId: "nav-dashboard",
    pageId: "page-dashboard",
    title: "Dashboard",
    short: "Home base",
    body: "Market mood, movers, and what changed today — your daily starting point.",
    action: "Open Dashboard",
  },
  {
    id: "logic",
    navId: "nav-logic",
    pageId: "page-logic",
    title: "Logic",
    short: "Plain English",
    body: "Ask why stocks move. Logic answers without jargon — like a patient friend who reads the tape.",
    action: "Try Logic",
  },
];

/** @type {{ discover: TourStep, intelligence: TourStep }} */
export const THIRD = {
  discover: {
    id: "discover",
    navId: "nav-discover",
    pageId: "page-discover",
    title: "Discover",
    short: "Find ideas",
    body: "Browse themes and sectors when you do not have a ticker yet — a gentle way to explore.",
    action: "Explore Discover",
  },
  intelligence: {
    id: "intelligence",
    navId: "nav-intelligence",
    pageId: "page-intelligence",
    title: "Intelligence",
    short: "Go deeper",
    body: "News, flows, and narrative context woven together — the story beneath the headline.",
    action: "Open Intelligence",
  },
};

/**
 * @param {'discover' | 'intelligence'} third
 * @returns {TourStep[]}
 */
export function getSteps(third = "discover") {
  return [...CORE, THIRD[third]];
}

/** Bloomberg briefing sections */
export function getBriefingSections(third = "discover") {
  const s = getSteps(third);
  return [
    {
      id: "open",
      kicker: "BRIEFTICK TERMINAL · SESSION OPEN",
      headline: "Good morning. Markets are live.",
      body: "This briefing walks you through three places every new user should know. Read at your pace — arrow or tap to advance.",
      meta: "— — —",
    },
    {
      id: s[0].id,
      kicker: "SECTION 01 · DASHBOARD",
      headline: s[0].title.toUpperCase(),
      body: s[0].body,
      meta: "Regime · Movers · Summary wheel",
    },
    {
      id: s[1].id,
      kicker: "SECTION 02 · LOGIC",
      headline: s[1].title.toUpperCase(),
      body: s[1].body,
      meta: "Natural language · Live context",
    },
    {
      id: s[2].id,
      kicker: `SECTION 03 · ${s[2].title.toUpperCase()}`,
      headline: s[2].title.toUpperCase(),
      body: s[2].body,
      meta: third === "discover" ? "Themes · Sectors · Momentum" : "Flows · News · Narrative",
    },
    {
      id: "close",
      kicker: "END OF BRIEFING",
      headline: "You are cleared to trade the session.",
      body: "Dashboard for orientation. Logic for questions. Discover or Intelligence when you want the next layer.",
      meta: "⌘K search any ticker",
    },
  ];
}

/** Co-pilot chat script */
export function getCopilotScript(third = "discover") {
  const s = getSteps(third);
  return [
    {
      role: "bot",
      text: "Hi — I'm your Brieftick co-pilot. I'll show you three spots that matter. Ready?",
      chips: ["Let's go", "Skip intro"],
    },
    {
      role: "bot",
      text: `First: **${s[0].title}**. ${s[0].body}`,
      chips: ["Show me Dashboard", "Next"],
    },
    {
      role: "bot",
      text: `Second: **${s[1].title}**. ${s[1].body}`,
      chips: ["Open Logic", "Next"],
    },
    {
      role: "bot",
      text: `Last stop: **${s[2].title}**. ${s[2].body}`,
      chips: [s[2].action, "Finish"],
    },
    {
      role: "bot",
      text: "You're set. Ask me anything on Logic whenever you're stuck.",
      chips: ["Done"],
    },
  ];
}

/** Quest challenges */
export function getQuestChallenges(third = "discover") {
  const s = getSteps(third);
  return [
    {
      id: "q1",
      step: s[0],
      title: "Morning check-in",
      task: "Review today's market mood on the Dashboard.",
      verifyLabel: "I checked the Dashboard",
      xp: 50,
    },
    {
      id: "q2",
      step: s[1],
      title: "Ask one question",
      task: 'Try asking: "Why is the market moving today?"',
      verifyLabel: "I asked Logic a question",
      xp: 75,
    },
    {
      id: "q3",
      step: s[2],
      title: "Find a story",
      task: `Browse ${s[2].title} for one theme that interests you.`,
      verifyLabel: `I explored ${s[2].title}`,
      xp: 100,
    },
  ];
}

/** Analyst whispers */
export function getAnalystNotes(third = "discover") {
  const s = getSteps(third);
  return [
    {
      step: s[0],
      mood: "calm",
      whisper: "Start here — Dashboard is your pulse check. Mood, movers, summary.",
      detail: s[0].body,
      cta: "Got it",
    },
    {
      step: s[1],
      mood: "curious",
      whisper: "Stuck on a headline? Logic translates market moves into plain English.",
      detail: s[1].body,
      cta: "Show Logic",
    },
    {
      step: s[2],
      mood: "focused",
      whisper: `When you want ideas, ${s[2].title} is where themes surface.`,
      detail: s[2].body,
      cta: "Open next",
    },
  ];
}

/** Mission path nodes */
export function getMissionNodes(third = "discover") {
  const s = getSteps(third);
  return s.map((step, i) => ({
    step,
    rank: ["Scout", "Analyst", "Explorer"][i],
    reward: ["+25 XP", "+50 XP", "+100 XP"][i],
    objective: step.body,
  }));
}
