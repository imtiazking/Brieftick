/**
 * FORGENIQ Logic — Free vs Terminal access rules.
 * @module logic/freeAccess
 */

export const FREE_LOGIC_DAILY_LIMIT = 5;

export const LOGIC_UPGRADE_MSG =
  "Upgrade to unlock full Logic: portfolio intelligence, scenario analysis, watchlist memory and advanced market signals.";

/** @typedef {'market-pulse'|'ticker'|'portfolio'|'sector-rotation'|'risk-regime'|'daily-brief'|'scenario'|'briefing'|'causal'|'macro-interpretation'|'watchlist'} LogicMode */

export const FREE_LOGIC_MODES = new Set([
  "market-pulse",
  "ticker",
  "watchlist",
  "risk-regime",
  "daily-brief",
  "briefing",
  "causal",
  "macro-interpretation",
]);

export const PREMIUM_LOGIC_MODES = new Set([
  "portfolio",
  "scenario",
  "sector-rotation",
]);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey() {
  const uid = window._clerkUser?.id || window.Clerk?.user?.id || "anonymous";
  return `brieftick_logic_usage_${uid}_${todayKey()}`;
}

export function isLogicTerminalUser() {
  return (
    (typeof window.hasTerminalAccess === "function" && window.hasTerminalAccess()) ||
    window._isTerminal === true ||
    (typeof window.isTerminal === "function" && window.isTerminal())
  );
}

export function getLogicUsageToday() {
  try {
    const raw = localStorage.getItem(storageKey());
    const n = parseInt(raw || "0", 10);
    return { count: Number.isFinite(n) ? n : 0, limit: FREE_LOGIC_DAILY_LIMIT };
  } catch (_) {
    return { count: 0, limit: FREE_LOGIC_DAILY_LIMIT };
  }
}

export function recordLogicUsage() {
  if (isLogicTerminalUser()) return getLogicUsageToday();
  const { count, limit } = getLogicUsageToday();
  const next = Math.min(count + 1, limit + 1);
  try {
    localStorage.setItem(storageKey(), String(next));
  } catch (_) {}
  return { count: next, limit };
}

/**
 * @param {LogicMode} mode
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkLogicAccess(mode) {
  if (isLogicTerminalUser()) return { ok: true };

  const resolved = mode || "market-pulse";

  if (PREMIUM_LOGIC_MODES.has(resolved)) {
    return { ok: false, reason: "premium_mode" };
  }

  if (!FREE_LOGIC_MODES.has(resolved)) {
    return { ok: false, reason: "premium_mode" };
  }

  const { count, limit } = getLogicUsageToday();
  if (count >= limit) {
    return { ok: false, reason: "daily_limit" };
  }

  return { ok: true };
}

export function getUsageBannerText() {
  if (isLogicTerminalUser()) return "Terminal Logic · unlimited";
  const { count, limit } = getLogicUsageToday();
  return `Ask Logic free tier: ${count}/${limit} used today`;
}
