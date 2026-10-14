import { createFreshState, migratePersistedState, STORAGE_KEY_V2, STORAGE_KEY_V1 } from '../js/migrate.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, v),
  removeItem: (k) => mem.delete(k),
};

const { initStore, updateAssessment, getState } = await import('../js/store.js');

initStore();
const before = getState().assessments.find((a) => a.id === 'IA-0042')?.status;
updateAssessment('IA-0042', { status: 'Review', comments: 'Submitted for review' }, 'Sarah Jones', 'Assessment review');
const after = getState().assessments.find((a) => a.id === 'IA-0042')?.status;
const aud = getState().auditEvents.find((e) => e.recordId === 'IA-0042' && e.action.includes('Assessment'));
mem.set(STORAGE_KEY_V2, JSON.stringify(getState()));
initStore();
const afterReload = JSON.parse(mem.get(STORAGE_KEY_V2)).assessments.find((a) => a.id === 'IA-0042')?.status;

if (before !== 'Draft' || after !== 'Review' || afterReload !== 'Review' || !aud) {
  console.error('IA propagation FAIL', { before, after, afterReload, aud });
  process.exit(1);
}
console.log('IA propagation OK');
