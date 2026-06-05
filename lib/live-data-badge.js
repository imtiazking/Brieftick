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

if (typeof window !== "undefined") {
  window.BrieftickLiveBadge = {
    badgeHtml,
    applyBadge,
    apply: applyBadge,
    badgeFromBriefingProvenance,
  };
}
