/**
 * Normalise provision core keys between orchestration ledgers, inventory, and AI citations.
 */
import { parseProvisionReference } from './provision-eligibility.mjs';

/** @returns {string[]} alias keys for Map lookup */
export function provisionCoreAliases(core) {
  const raw = String(core ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const out = new Set([raw]);
  const parsed = parseProvisionReference(raw.startsWith('CONC ') ? raw : `CONC ${raw}`);
  if (parsed?.core) out.add(parsed.core);
  if (raw.startsWith('TP ')) out.add(`SYSC ${raw}`);
  return [...out];
}

/** @param {Iterable<string>} cores */
export function expandProvisionCoreSet(cores) {
  const out = new Set();
  for (const c of cores || []) {
    for (const a of provisionCoreAliases(c)) out.add(a);
  }
  return out;
}

export function resolveInventoryRowByCore(byCore, core) {
  for (const alias of provisionCoreAliases(core)) {
    const row = byCore.get(alias);
    if (row) return row;
  }
  return null;
}