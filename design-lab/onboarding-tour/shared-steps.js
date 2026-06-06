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

/** Strategist-guided sessions — first-person, teaching-focused */
export function getStrategistSessions(third = "discover") {
  const s = getSteps(third);
  return {
    intro: {
      headline: "I'll walk you through Brieftick",
      body: "I'm Elena, senior market strategist. In about two minutes I'll show you the three places every new user should know — without overwhelming you.",
      duration: "~2 min",
    },
    stops: [
      {
        step: s[0],
        stopLabel: "Stop 1 · Orientation",
        title: "Start on the Dashboard",
        strategistSays:
          "Every session begins here. I read market mood, movers, and what changed — then decide where to dig deeper.",
        teach: [
          "Check Market Risk for today's tone",
          "Scan top movers for leadership",
          "Open Summary for the plain-English brief",
        ],
        lookFor: "The Intelligence Wheel — your control panel for the session.",
        ctaWalk: "Show me the Dashboard",
        ctaNext: "I've got the Dashboard",
      },
      {
        step: s[1],
        stopLabel: "Stop 2 · Questions",
        title: "Ask Logic in plain English",
        strategistSays:
          "When a headline confuses you, don't guess. Logic is how I answer 'why is this moving?' without Wall Street jargon.",
        teach: [
          "Ask one clear question at a time",
          "Logic uses live market context",
          "Great for beginners who want clarity fast",
        ],
        lookFor: "Try a question like: “Why are tech stocks lagging today?”",
        ctaWalk: "Take me to Logic",
        ctaNext: "Ready for the next stop",
      },
      {
        step: s[2],
        stopLabel: "Stop 3 · Discovery",
        title: `Explore ${s[2].title}`,
        strategistSays: `When you don't have a ticker in mind, ${s[2].title} is where I hunt for themes and stories worth researching.`,
        teach: [
          "Browse by sector or theme",
          "Follow momentum without chasing hype",
          "Save ideas to your watchlist later",
        ],
        lookFor: "Pick one theme that fits your style — that's enough for today.",
        ctaWalk: `Open ${s[2].title}`,
        ctaNext: "Finish session",
      },
    ],
    outro: {
      headline: "You're oriented.",
      body: "Dashboard for the pulse. Logic for questions. Discover or Intelligence when you want the next layer. I'll stay out of your way now.",
    },
  };
}

/** @deprecated Use getStrategistSessions */
export function getAnalystNotes(third = "discover") {
  const sessions = getStrategistSessions(third);
  return sessions.stops.map((stop) => ({
    step: stop.step,
    mood: "focused",
    whisper: stop.strategistSays,
    detail: stop.teach.join(" · "),
    cta: stop.ctaNext,
  }));
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
