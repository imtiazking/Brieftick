/**
 * Visible data provenance badges (Live / Delayed / Mixed / Illustrative).
 * @module lib/live-data-badge
 */

/** @typedef {'live'|'delayed'|'mixed'|'illustrative'} LiveBadgeKind */

const LABELS = {
  live: "Live",
  delayed: "Delayed",
  mixed: "Mixed",
  illustrative: "Illustrative",
};

/** Options module — user-facing beta (not a live-data provenance badge). */
export const OPTIONS_BETA_LABEL = "Options Beta";
export const OPTIONS_BETA_SUBTEXT = "Live options flow coming soon";

/**
 * @param {LiveBadgeKind} kind
 * @param {string} [title]
 */
export function badgeHtml(kind, title = "") {
  const k = LABELS[kind] ? kind : "illustrative";
  const tip = title ? ` title="${String(title).replace(/"/g, "&quot;")}"` : "";
  return `<span class="bt-live-badge bt-live-badge--${k}"${tip}>${LABELS[k]}</span>`;
}

/**
 * @param {HTMLElement | null} el
 * @param {LiveBadgeKind} kind
 * @param {string} [title]
 */
export function applyBadge(el, kind, title = "") {
  if (!el) return;
  const k = LABELS[kind] ? kind : "illustrative";
  el.className = `bt-live-badge bt-live-badge--${k}`;
  el.textContent = LABELS[k];
  if (title) el.setAttribute("title", title);
  else el.removeAttribute("title");
}

/**
 * Map briefing wheel provenance to badge kind.
 * @param {string} provenance
 * @returns {LiveBadgeKind}
 */
export function badgeFromBriefingProvenance(provenance) {
  if (provenance === "Live") return "live";
  if (provenance === "Mixed") return "mixed";
  return "illustrative";
}

/**
 * Options page badge — always beta / coming-soon (independent of internal data mode).
 * @param {HTMLElement | null} badgeEl
 * @param {HTMLElement | null} [subtextEl]
 */
export function applyOptionsBetaBadge(badgeEl, subtextEl) {
  if (badgeEl) {
    badgeEl.className = "bt-live-badge bt-live-badge--options-beta";
    badgeEl.textContent = OPTIONS_BETA_LABEL;
    badgeEl.setAttribute("title", OPTIONS_BETA_SUBTEXT);
  }
  if (subtextEl) subtextEl.textContent = OPTIONS_BETA_SUBTEXT;
}

if (typeof window !== "undefined") {
  window.BrieftickLiveBadge = {
    badgeHtml,
    applyBadge,
    apply: applyBadge,
    badgeFromBriefingProvenance,
    applyOptionsBetaBadge,
    OPTIONS_BETA_LABEL,
    OPTIONS_BETA_SUBTEXT,
  };
}
