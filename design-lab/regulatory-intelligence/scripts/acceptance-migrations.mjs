import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { validateMinimalState } from '../js/platform/startup-validation.js';

const base = createFreshState();
const milestones = [1, 3, 5, 7, 8, 9, 10, 14];

let fail = 0;
for (const v of milestones) {
  const snap = {
    schemaVersion: v,
    scenarioId: base.scenarioId,
    publications: base.publications.slice(0, 3),
    changes: base.changes.slice(0, 2),
    assessments: base.assessments.slice(0, 1),
    auditEvents: base.auditEvents.slice(0, 5),
  };
  const migrated = migrateSavedSnapshot(snap);
  const ok = migrated.schemaVersion === SCHEMA_VERSION && validateMinimalState(migrated).ok;
  console.log(`schema ${v} → ${migrated.schemaVersion}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) fail += 1;
}

const twice = migrateSavedSnapshot(migrateSavedSnapshot({ schemaVersion: 8, scenarioId: 'consumer-duty' }));
const thrice = migrateSavedSnapshot(twice);
console.log(`idempotent publications: ${twice.publications.length === thrice.publications.length ? 'PASS' : 'FAIL'}`);
if (twice.publications.length !== thrice.publications.length) fail += 1;

process.exit(fail ? 1 : 0);
