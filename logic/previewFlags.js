/**
 * Preview / conversational Logic environment detection (browser).
 * @module logic/previewFlags
 */

const PREVIEW_QUERY_VALUES = new Set(["logic", "agent"]);

/**
 * True when the conversational Logic preview should be active.
 * @returns {boolean}
 */
export function isConversationalLogicPreview() {
  if (typeof window === "undefined") return false;
  if (window.__LOGIC_PREVIEW === true) return true;
  try {
    if (document.documentElement?.classList.contains("preview-logic")) return true;
  } catch {
    /* ignore */
  }
  const search =
    typeof window !== "undefined" && window.location?.search != null
      ? window.location.search
      : "";
  const p = new URLSearchParams(search).get("preview");
  return PREVIEW_QUERY_VALUES.has(p);
}

/**
 * Sync window flag and document class from URL (idempotent).
 */
export function syncLogicPreviewFlags() {
  if (typeof window === "undefined") return;
  if (!isConversationalLogicPreview()) return;
  window.__LOGIC_PREVIEW = true;
  document.documentElement?.classList.add("preview-logic");
}
