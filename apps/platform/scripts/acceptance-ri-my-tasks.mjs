#!/usr/bin/env node
/**
 * Local acceptance: My Tasks pagination helpers and API route wiring.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  paginateMyTasks,
  summariseMyTaskMetrics,
  taskMatchesViewFilter,
} from '../lib/ri/tasks/my-tasks-list-pagination.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const sample = [
  { id: 'a', taskTitle: 'A', assignedTo: 'user_a', slaState: 'On Track', completed: false, awaitingReview: false, unassigned: false },
  { id: 'b', taskTitle: 'B', assignedTo: null, slaState: 'On Track', completed: false, awaitingReview: true, unassigned: true },
  { id: 'c', taskTitle: 'C', assignedTo: 'user_a', slaState: 'Overdue', dueDate: '2020-01-01', completed: false, awaitingReview: false, unassigned: false },
];

check('pagination page size 25', paginateMyTasks(sample, { pageSize: 25 }).items.length === 3);
check('OPEN filter', paginateMyTasks(sample, { viewFilter: 'OPEN' }).pagination.totalItems === 3);
check('UNASSIGNED filter', paginateMyTasks(sample, { viewFilter: 'UNASSIGNED' }).pagination.totalItems === 1);
check('metrics mine open', summariseMyTaskMetrics(sample, 'user_a').myOpenTasks === 2);
check('taskMatchesViewFilter AWAITING_REVIEW', taskMatchesViewFilter(sample[1], 'AWAITING_REVIEW'));

const myTasksTs = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'my-tasks.ts'), 'utf8');
check('service exports buildMyTasks', myTasksTs.includes('export async function buildMyTasks'));
check('no independent task table', !myTasksTs.includes('my_tasks'));

const route = readFileSync(join(platformRoot, 'app', 'api', 'ri-lab', 'my-tasks', 'route.ts'), 'utf8');
check('API route uses buildMyTasks', route.includes('buildMyTasks'));

const labJs = readFileSync(
  join(platformRoot, '..', '..', 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'connected-my-tasks.js'),
  'utf8',
);
check('Design Lab My Tasks screen', labJs.includes('My Tasks') && labJs.includes('data-my-tasks-screen'));
check('Design Lab does not load full triage inventory in browser', !labJs.includes('ALL_FINDINGS'));

const appJs = readFileSync(
  join(platformRoot, '..', '..', 'design-lab', 'regulatory-intelligence', 'js', 'app.js'),
  'utf8',
);
check('Nav renamed My Tasks', appJs.includes("label: 'My Tasks'"));

if (fail) {
  console.error(`\nacceptance-ri-my-tasks: ${fail} failure(s)`);
  process.exit(1);
}
console.log(`\nacceptance-ri-my-tasks: PASS (${pass} checks)`);