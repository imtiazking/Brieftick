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
  body: "Six quick stops, about ten minutes. I'll walk you through the daily loop so you know where to go — without memorizing the menu.",
  beginCta: "Begin Mission 1",
  skipCta: "Skip for now",
};

export const COMPLETION = {
  headline: "Session cleared",
  subhead: "You're ready to use Brieftick",
  loopSummary:
    "Start on the Dashboard to read the market. When something moves, open What's Moving. Ask Logic when you're stuck. Use Discover for ideas, Earnings when the week gets busy, and your Watchlist to make the session yours.",
  closingLine:
    "Come back tomorrow the same way: Dashboard first, then your list. Logic is there whenever a headline doesn't land.",
  enterCta: "Enter Brieftick",
  restartCta: "Restart Mission Path",
};

/**
 * @typedef {Object} MissionChecklistItem
 * @property {string} wheelId
 * @property {string} label
 * @property {string} [hint]
 */

/**
 * @typedef {Object} MissionDef
 * @property {string} id
 * @property {string} title
 * @property {string} rank
 * @property {number} xp
 * @property {string} route
 * @property {string} [wheelId]
 * @property {string} lead
 * @property {string} context
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
    lead: "The Dashboard is where every session starts. The Intelligence Wheel gives you mood, movers, sectors, and what deserves attention — before you touch a single ticker.",
    context:
      "Reach for this at the open, after you've been away, or any time the market feels noisy and you need your bearings.",
    action: "Work through the four wheel stops below. Tap each one and take a quick look on screen.",
    verifyLabel: "I've read the market",
    helper: "Each tap takes you straight there.",
    checklist: [
      { wheelId: "volatility", label: "Read today's market mood", hint: "Is the tone calm, cautious, or risk-off?" },
      { wheelId: "alerts", label: "See what to watch this week", hint: "One headline worth keeping on radar." },
      { wheelId: "heatmap", label: "Scan where strength is", hint: "Which sectors are leading right now." },
      { wheelId: "movers", label: "Check who's leading", hint: "The names setting the pace today." },
    ],
  },
  {
    id: "investigate-move",
    title: "Investigate a Move",
    rank: "Scout",
    xp: 25,
    route: "why",
    lead: "What's Moving tells the story behind the price. The Dashboard shows who moved; this page explains why.",
    context:
      "Open it when a stock jumps on your feed, when you don't recognize a leader, or when you want the narrative — not just the percentage.",
    action: "Pick one stock from today's briefing and read its move story.",
    verifyLabel: "I read one mover story",
    helper: "Any name from the briefing works.",
  },
  {
    id: "ask-market",
    title: "Ask the Market",
    rank: "Analyst",
    xp: 50,
    route: "logic",
    lead: "Logic answers in plain English. Ask one clear question and get context — drivers, signals, sources — without the jargon.",
    context:
      "Use it when a headline confuses you, when you have a ticker but no thesis, or when you want to go deeper after reading the market.",
    action: 'Ask one question. A good start: "What\'s the market doing today?"',
    verifyLabel: "I asked Logic a question",
    helper: "One question at a time.",
  },
  {
    id: "find-opportunities",
    title: "Find Opportunities",
    rank: "Explorer",
    xp: 50,
    route: "scanner",
    lead: "Discover is for when you don't have a ticker yet. Browse a theme or run a scan to surface names worth a closer look.",
    context:
      "Come here when you want fresh ideas, when a sector is heating up on the Dashboard, or when you're building a list to follow.",
    action: "Run a scan and open one stock card to see why it appeared.",
    verifyLabel: "I found one idea",
    verifyLabelFree: "I see how Discover works",
    helper: "Full scans unlock with Terminal. The layout and sample cards still show you the flow.",
  },
  {
    id: "understand-earnings",
    title: "Understand Earnings",
    rank: "Strategist",
    xp: 75,
    route: "earnings",
    lead: "Earnings is your weekly calendar in plain English — who reports, why it matters, and what could move the stock.",
    context:
      "Check it when you're planning the week, before a name you follow reports, or after a gap you didn't see coming.",
    action: "Choose one company reporting this week and read its brief.",
    verifyLabel: "I checked one earnings report",
    helper: "Note the date, the expected move, and the one line Wall Street cares about.",
  },
  {
    id: "build-watchlist",
    title: "Build Your Watchlist",
    rank: "Curator",
    xp: 100,
    route: "dashboard",
    wheelId: "watchlist",
    lead: "Your Watchlist is the shortlist you actually follow. It lives on your Dashboard and stays on your device.",
    context:
      "Add names after Discover or Movers, glance at it when you sit down, and keep reporting names handy before earnings week.",
    action: "Open Watchlist on the wheel and save one ticker you care about.",
    verifyLabel: "I added a ticker to my watchlist",
    helper: "One name is enough to start.",
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
