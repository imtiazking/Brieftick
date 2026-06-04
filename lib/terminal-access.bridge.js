/**
 * Expose terminal access helpers on `window` for inline scripts in index.html.
 */
import {
  hasTerminalAccess,
  isAdminFromUser,
  isAdminRole,
  logTerminalAccessState,
  normalizeRole,
  getAccessEntitlements,
} from "./terminal-access.js";

window.BrieftickAccess = {
  normalizeRole,
  isAdminRole,
  isAdminFromUser,
  hasTerminalAccess,
  getAccessEntitlements,
  logTerminalAccessState,
};

window.hasTerminalAccess = hasTerminalAccess;
window.isAdmin = () => isAdminFromUser(window.Clerk?.user || window._clerkUser);
window.isTerminal = () => hasTerminalAccess();
window.isFree = () => !hasTerminalAccess();
window.logTerminalAccessState = logTerminalAccessState;
