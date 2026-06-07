/**
 * Mission Path — production content (Build Plan v1).
 * @module lib/mission-path/content
 */

/** Minutes remaining label per mission index (0–5 → missions 1–6). */
export const TIME_REMAINING = [10, 8, 6, 5, 3, 1];

export const TOTAL_MISSIONS = 6;
export const TOTAL_XP = 325;
export const FINAL_RANK = "Curator";

export const WELCOME = {
  tag: "Session Quest",
  headline: "Learn the Brieftick workflow",
  body: "Six short missions (~10 minutes). You'll learn the daily loop — orient, investigate, ask, discover, plan, and follow — without memorizing the menu.",
  whyMatters:
    "The platform has many surfaces. This teaches when to use each one so you're not guessing on day one.",
  beginCta: "Begin Mission 1",
  skipCta: "Skip for now",
};

export const COMPLETION = {
  headline: "Session cleared",
  subhead: "You're ready to use Brieftick",
  whyMatters:
    "You don't need to memorize the menu. Come back tomorrow: Dashboard first, then your Watchlist. Ask Logic whenever a headline doesn't make sense.",
  enterCta: "Enter Brieftick",
  restartCta: "Restart Mission Path",
  loop: [
    { n: 1, title: "Read the Market", dest: "Dashboard" },
    { n: 2, title: "Investigate a Move", dest: "What's Moving" },
    { n: 3, title: "Ask the Market", dest: "Logic" },
    { n: 4, title: "Find Opportunities", dest: "Discover" },
    { n: 5, title: "Understand Earnings", dest: "Earnings" },
    { n: 6, title: "Build Your Watchlist", dest: "Watchlist" },
  ],
};

/**
 * @typedef {Object} MissionChecklistItem
 * @property {string} wheelId
 * @property {string} label
 * @property {string} teach
 */

/**
 * @typedef {Object} MissionDef
 * @property {string} id
 * @property {string} title
 * @property {string} rank
 * @property {number} xp
 * @property {string} route
 * @property {string} [wheelId]
 * @property {string} whatIsIt
 * @property {string} whyMatters
 * @property {string[]} whenToUse
 * @property {string} action
 * @property {string} verifyLabel
 * @property {string} [verifyLabelFree]
 * @property {string} [helper]
 * @property {MissionChecklistItem[]} [checklist]
 */

/** @type {MissionDef[]} */
export const MISSIONS = [
  {
    id: "read-market",
    title: "Read the Market",
    rank: "Scout",
    xp: 25,
    route: "dashboard",
    whatIsIt:
      "Your session home base. The Intelligence Wheel shows market mood, what to watch, sector strength, and today's leaders — before you pick a single stock.",
    whyMatters:
      "Most bad decisions start without context. Reading the market first tells you what kind of day it is — calm, choppy, or risk-off — so everything else makes sense.",
    whenToUse: [
      "Start of every session",
      "After being away for hours",
      "Whenever you feel reactive or lost mid-day",
    ],
    action:
      "On the Dashboard wheel, visit four channels: Market Risk → What Matters → Sectors → Leadership.",
    verifyLabel: "I've read the market",
    helper: "Tap each item to jump there on the wheel.",
    checklist: [
      { wheelId: "volatility", label: "Check market mood", teach: "How cautious is today?" },
      { wheelId: "alerts", label: "See what to watch", teach: "What should stay on my radar?" },
      { wheelId: "heatmap", label: "Scan sector strength", teach: "Where is money flowing?" },
      { wheelId: "movers", label: "Review top movers", teach: "Who is leading right now?" },
    ],
  },
  {
    id: "investigate-move",
    title: "Investigate a Move",
    rank: "Scout",
    xp: 25,
    route: "why",
    whatIsIt:
      "Plain-English stories behind price moves. Dashboard shows who moved; What's Moving explains why.",
    whyMatters:
      "A green or red number without a reason is just noise. This is where you learn to connect price to catalyst — the skill that separates reacting from understanding.",
    whenToUse: [
      "A stock jumps on your feed",
      "Dashboard shows an unfamiliar leader",
      "You want the story, not just the % change",
    ],
    action: "Open What's Moving, pick one stock, and read its move story.",
    verifyLabel: "I read one mover story",
    helper: "Pick any name from today's briefing.",
  },
  {
    id: "ask-market",
    title: "Ask the Market",
    rank: "Analyst",
    xp: 50,
    route: "logic",
    whatIsIt:
      "Ask the market a question in plain English. Logic answers with structured context — drivers, signals, and sources — without Wall Street jargon.",
    whyMatters:
      "When you're stuck, guessing is expensive. One clear question beats twenty open tabs. Logic is your shortcut from confusion to clarity.",
    whenToUse: [
      "A headline confuses you",
      "You have a ticker but no thesis",
      "After Dashboard or Movers when you want to go deeper",
    ],
    action: 'Open Logic and ask one question. Try: "What\'s the market doing today?"',
    verifyLabel: "I asked Logic a question",
    helper: "One question at a time works best.",
  },
  {
    id: "find-opportunities",
    title: "Find Opportunities",
    rank: "Explorer",
    xp: 50,
    route: "scanner",
    whatIsIt:
      "A simple stock finder. Browse ideas by theme or run a scan when you don't have a ticker in mind yet.",
    whyMatters:
      "If you only watch the same five stocks, you miss what's actually leading the market. Discover helps you find new names worth a look — without needing to be an expert.",
    whenToUse: [
      "You want ideas but don't know where to start",
      "Dashboard shows a hot sector",
      "You're building a list for your Watchlist",
    ],
    action: "Open Discover Stocks, tap Run scan, and open one stock card.",
    verifyLabel: "I found one idea",
    verifyLabelFree: "I see how Discover works",
    helper: "Full scans unlock with Terminal. Sample results still show the workflow.",
  },
  {
    id: "understand-earnings",
    title: "Understand Earnings",
    rank: "Strategist",
    xp: 75,
    route: "earnings",
    whatIsIt:
      "This week's earnings calendar in plain English — who reports, why it matters, and what Wall Street is watching.",
    whyMatters:
      "Earnings are scheduled events that can move stocks sharply. Knowing what's coming prevents surprise gaps and helps you plan the week.",
    whenToUse: [
      "Sunday or Monday planning",
      "Before a company you follow reports",
      "After an unexpected gap you didn't see coming",
    ],
    action: "Open Earnings, pick one company reporting this week, and read Quick brief + What to watch.",
    verifyLabel: "I checked one earnings report",
    helper: "Focus on date, expected move, and one metric to watch.",
  },
  {
    id: "build-watchlist",
    title: "Build Your Watchlist",
    rank: "Curator",
    xp: 100,
    route: "dashboard",
    wheelId: "watchlist",
    whatIsIt:
      "Your personal shortlist of tickers to follow. Saved on your device and visible every time you open the Dashboard.",
    whyMatters:
      "Browsing is fine once; investing in your workflow means following names over time. Your Watchlist turns Brieftick from a tour into your cockpit.",
    whenToUse: [
      "After Discover or Movers when you find a name worth tracking",
      "Start of session to check your list",
      "Before earnings week",
    ],
    action: "Go to Dashboard → Watchlist on the wheel and add one ticker.",
    verifyLabel: "I added a ticker to my watchlist",
    helper: "Start with one — you can always add more later.",
  },
];

/**
 * @param {number} missionIndex 0-based active mission
 * @returns {string}
 */
export function formatProgressMeta(missionIndex) {
  const n = Math.min(Math.max(missionIndex, 0), TOTAL_MISSIONS - 1) + 1;
  const mins = TIME_REMAINING[missionIndex] ?? 1;
  return `Mission ${n} of ${TOTAL_MISSIONS} · ~${mins} min remaining`;
}

/**
 * @param {import('./store.js').UserProgress} progress
 * @returns {number}
 */
export function computeXp(progress) {
  if (!progress?.completedMissions?.length) return 0;
  return progress.completedMissions.reduce((sum, idx) => {
    const m = MISSIONS[idx];
    return sum + (m?.xp ?? 0);
  }, 0);
}

/**
 * @param {import('./store.js').UserProgress} progress
 * @returns {string}
 */
export function currentRankLabel(progress) {
  const idx = progress?.currentMission ?? 0;
  const m = MISSIONS[Math.min(idx, MISSIONS.length - 1)];
  return m?.rank ?? "Scout";
}
