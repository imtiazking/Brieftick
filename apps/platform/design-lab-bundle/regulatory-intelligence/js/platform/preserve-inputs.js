/**
 * Keeps unsaved values in fields marked `data-preserve-input="<key>"` across full view re-renders
 * (every store notify rebuilds #ri-main). Only fields the user changed from their rendered value are
 * restored, and only when the route is unchanged, so fresh server data still wins for untouched fields.
 */

function isEdited(el) {
  if (el instanceof HTMLSelectElement) {
    const rendered = Array.from(el.options).find((o) => o.defaultSelected) || el.options[0];
    return Boolean(rendered) && el.value !== rendered.value;
  }
  return el.value !== el.defaultValue;
}

/** @returns {{ routeKey: string, values: Map<string, string>, focus: { key: string, start: number | null, end: number | null } | null }} */
export function capturePreservedInputs(root, routeKey) {
  const values = new Map();
  let focus = null;
  if (!root) return { routeKey, values, focus };
  root.querySelectorAll('[data-preserve-input]').forEach((el) => {
    const key = el.getAttribute('data-preserve-input');
    if (!key) return;
    if (isEdited(el)) values.set(key, el.value);
    if (el === document.activeElement) {
      let start = null;
      let end = null;
      try {
        start = el.selectionStart;
        end = el.selectionEnd;
      } catch {
        /* selects have no selection range */
      }
      focus = { key, start, end };
    }
  });
  return { routeKey, values, focus };
}

export function restorePreservedInputs(root, routeKey, snapshot) {
  if (!root || !snapshot || snapshot.routeKey !== routeKey) return;
  for (const [key, value] of snapshot.values) {
    const el = root.querySelector(`[data-preserve-input="${CSS.escape(key)}"]`);
    if (el && !el.disabled) el.value = value;
  }
  if (snapshot.focus) {
    const el = root.querySelector(`[data-preserve-input="${CSS.escape(snapshot.focus.key)}"]`);
    if (el && !el.disabled) {
      el.focus({ preventScroll: true });
      if (snapshot.focus.start !== null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(snapshot.focus.start, snapshot.focus.end ?? snapshot.focus.start);
        } catch {
          /* not a text field */
        }
      }
    }
  }
}
