/**
 * Generic suite case filtering for Phase 2C.2 evaluation runs (no case-specific logic).
 */

/**
 * @param {object[]} cases - runnable suite cases
 * @param {{ allowedTestIds: string[], blocked: object[] }} allowlist
 * @param {{ publicProviderOnly?: boolean, testIds?: string[] }} options
 */
export function filterEvalSuiteCases(cases, allowlist, options = {}) {
  let filtered = [...cases];

  if (options.publicProviderOnly) {
    const allowed = new Set(allowlist.allowedTestIds || []);
    filtered = filtered.filter((c) => allowed.has(c.testId));
  }

  if (options.testIds?.length) {
    const want = new Set(options.testIds.map((id) => String(id).trim()).filter(Boolean));
    filtered = filtered.filter((c) => want.has(c.testId));
  }

  return filtered;
}

export function parseTestIdsArg(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateEvalCaseFilter(cases, allowlist, options = {}) {
  const errors = [];
  const runnableIds = new Set(cases.map((c) => c.testId));
  if (options.testIds?.length) {
    for (const id of options.testIds) {
      if (!runnableIds.has(id)) errors.push(`unknown_or_held_out_test_id:${id}`);
    }
  }
  if (options.publicProviderOnly && !allowlist?.allowedTestIds?.length) {
    errors.push('public_allowlist_empty');
  }
  const filtered = filterEvalSuiteCases(cases, allowlist, options);
  if (!filtered.length) errors.push('filter_selects_zero_cases');
  return { ok: errors.length === 0, errors, filtered };
}
