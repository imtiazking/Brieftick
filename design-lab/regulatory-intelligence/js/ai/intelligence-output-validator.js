import { AI_TASK_TYPE } from './enums.js';

export function validateIntelligenceOutput(taskType, output, contextBundle) {
  if (taskType === AI_TASK_TYPE.AI_TEXT_COMPARISON) {
    const expected = contextBundle?.deterministicDiff;
    const got = output?.deterministicDiff;
    if (expected && got) {
      if (JSON.stringify(got.added) !== JSON.stringify(expected.added)) {
        return { ok: false, message: 'AI altered deterministic diff (added)' };
      }
      if (JSON.stringify(got.removed) !== JSON.stringify(expected.removed)) {
        return { ok: false, message: 'AI altered deterministic diff (removed)' };
      }
    }
  }
  if (taskType === AI_TASK_TYPE.AI_RI_QA && output?.openObligationCount != null) {
    const expected = contextBundle?.deterministicFacts?.openObligationCount;
    if (expected != null && output.openObligationCount !== expected) {
      return { ok: false, message: 'openObligationCount must match RI deterministic count' };
    }
  }
  if (taskType === AI_TASK_TYPE.AI_IMPLEMENTATION_MAPPING && contextBundle?.reviewedMapping) {
    if (output?.relationshipLabel !== 'REVIEWED MAPPING') {
      return { ok: false, message: 'Must label reviewed mapping as authoritative when present' };
    }
  }
  return { ok: true };
}
