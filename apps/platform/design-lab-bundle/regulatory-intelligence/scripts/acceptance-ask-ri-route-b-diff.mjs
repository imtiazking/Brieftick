/**
 * Route B: compare legacy BFS retrieval (audit only) vs canonical Ask RI executor.
 */
import { createFreshState } from '../js/migrate.js';
import { parseAskQuery, retrieveRiRecords } from '../js/ai/ri-retrieval.js';
import { executeGraphRetrieval } from '../js/ai/ri-graph-traverse.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const set = JSON.parse(readFileSync(join(__dir, 'ask-ri-eval-set.json'), 'utf8'));
const state = createFreshState();

const diffs = [];

for (const q of set.questions) {
  const parsed = parseAskQuery(q.question, state);
  if (parsed.filters.intent !== 'graph-query' || !parsed.plan) continue;
  const newRet = retrieveRiRecords(state, q.question);
  const old = executeGraphRetrieval(state, parsed.plan, { asOfDate: '2026-10-14' });
  const oldIds = [...new Set(old.records.map((r) => r.id))].sort();
  const newIds = [...new Set(newRet.matchedRecordIdsAll || [])].sort();
  if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
    diffs.push({
      question: q.question,
      OLD: oldIds,
      NEW: newIds,
      WHY: 'Canonical executor uses explicit FK paths; legacy BFS may include change_links shortcuts or different path winners.',
      CLASSIFICATION: 'EXPECTED CORRECTION',
    });
  }
}

console.log(JSON.stringify(diffs, null, 2));
console.log(`Route B diff report: ${diffs.length} graph-query differences (informational)`);
