/**
 * Preview / QA session helpers — never active on production (forgeniq.com).
 * Speeds up UI testing on Vercel preview deploys and ?qa=1 without changing prod auth.
 */
(function (global) {
  const STORAGE_KEY = "bt_preview_qa";
  const ROUTE_KEY = "bt_qa_last_route";
  const CLERK_HINT_KEY = "bt_qa_clerk_user_id";

  function hostname() {
    return (global.location?.hostname || "").toLowerCase();
  }

  function isProductionHost() {
    return /^(www\.)?(forgeniq|brieftick)\.com$/i.test(hostname());
  }

  function isVercelPreviewHost() {
    return hostname().endsWith(".vercel.app");
  }

  function hasQaParam() {
    try {
      return new URLSearchParams(global.location?.search || "").get("qa") === "1";
    } catch {
      return false;
    }
  }

  function persistQaFlag() {
    if (isProductionHost()) return;
    if (isVercelPreviewHost() || hasQaParam()) {
      try {
        global.localStorage?.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  function isPreviewQaActive() {
    if (isProductionHost()) return false;
    if (isVercelPreviewHost() || hasQaParam()) return true;
    try {
      return global.localStorage?.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  /** Routes reachable without Clerk on preview QA (UI testing only). */
  const QA_ROUTES = new Set([
    "dashboard",
    "scanner",
    "why",
    "earnings",
    "portfolio",
    "portfolio-insights",
    "logic",
    "landing",
    "pricing",
    "about",
  ]);

  function isPreviewQaRoute(name) {
    return isPreviewQaActive() && QA_ROUTES.has(name);
  }

  function saveRoute(name) {
    if (!isPreviewQaActive() || !name) return;
    try {
      global.sessionStorage?.setItem(ROUTE_KEY, name);
      global.localStorage?.setItem(ROUTE_KEY, name);
    } catch {
      /* ignore */
    }
  }

  function restoreRoute() {
    if (!isPreviewQaActive()) return null;
    try {
      return (
        global.sessionStorage?.getItem(ROUTE_KEY) ||
        global.localStorage?.getItem(ROUTE_KEY) ||
        null
      );
    } catch {
      return null;
    }
  }

  function rememberClerkUser(user) {
    if (!isPreviewQaActive() || !user?.id) return;
    try {
      global.localStorage?.setItem(CLERK_HINT_KEY, user.id);
    } catch {
      /* ignore */
    }
  }

  function clerkHintUserId() {
    if (!isPreviewQaActive()) return null;
    try {
      return global.localStorage?.getItem(CLERK_HINT_KEY);
    } catch {
      return null;
    }
  }

  persistQaFlag();

  global.__BT_PREVIEW_QA__ = isPreviewQaActive();
  global.isPreviewQaActive = isPreviewQaActive;
  global.isPreviewQaRoute = isPreviewQaRoute;
  global.btQaSaveRoute = saveRoute;
  global.btQaRestoreRoute = restoreRoute;
  global.btQaRememberClerkUser = rememberClerkUser;
  global.btQaClerkHintUserId = clerkHintUserId;
})(window);
