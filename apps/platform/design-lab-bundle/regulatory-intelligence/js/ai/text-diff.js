/**
 * Deterministic line-level diff for regulatory text comparison (5C).
 */

export function deterministicTextDiff(oldText, newText) {
  const oldLines = String(oldText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const newLines = String(newText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = newLines.filter((l) => !oldSet.has(l));
  const removed = oldLines.filter((l) => !newSet.has(l));
  const changed = [];
  for (let i = 0; i < Math.min(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i] && oldSet.has(newLines[i]) === false && newSet.has(oldLines[i]) === false) {
      changed.push({ from: oldLines[i], to: newLines[i] });
    }
  }
  return { added, removed, changed, oldLineCount: oldLines.length, newLineCount: newLines.length };
}

export const FIXTURE_PS24_OLD = `Firms must communicate clearly with customers during operational incidents affecting material services.`;

export const FIXTURE_PS24_NEW = `Firms must communicate clearly with customers during operational incidents affecting material services.
Additional paragraph added in amended version for version-detection testing.`;
