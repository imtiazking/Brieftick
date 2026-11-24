/** Server-side pagination and filters for My Tasks (Design Lab + ri-lab API). */

export const MY_TASKS_PAGE_SIZES = [25, 50, 100];
export const MY_TASKS_DEFAULT_PAGE_SIZE = 25;

export function normaliseMyTasksPageSize(value) {
  const n = Number(value);
  return MY_TASKS_PAGE_SIZES.includes(n) ? n : MY_TASKS_DEFAULT_PAGE_SIZE;
}

export function normaliseMyTasksPage(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const OPEN_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'CLOSED', 'HISTORIC', 'APPROVED', 'PASS']);

/**
 * @param {{ completed?: boolean, slaState?: string, awaitingReview?: boolean, unassigned?: boolean, assignedTo?: string | null, entityType?: string, taskAction?: string, priority?: string | null, taskTitle?: string, reference?: string | null, regulator?: string | null, status?: string }} task
 * @param {string} viewFilter OPEN|AWAITING_REVIEW|OVERDUE|DUE_SOON|COMPLETED|UNASSIGNED|ALL
 */
export function taskMatchesViewFilter(task, viewFilter) {
  const key = String(viewFilter || 'OPEN').toUpperCase();
  if (key === 'ALL') return true;
  if (key === 'COMPLETED') return Boolean(task.completed);
  if (key === 'OPEN') return !task.completed;
  if (key === 'AWAITING_REVIEW') return Boolean(task.awaitingReview) && !task.completed;
  if (key === 'OVERDUE') return task.slaState === 'Overdue' && !task.completed;
  if (key === 'DUE_SOON') return task.slaState === 'Due Soon' && !task.completed;
  if (key === 'UNASSIGNED') return Boolean(task.unassigned) && !task.completed;
  return true;
}

/**
 * @param {{ entityType?: string, taskAction?: string, taskTitle?: string, reference?: string | null, regulator?: string | null, status?: string, priority?: string | null }} task
 * @param {string} typeFilter
 */
export function taskMatchesTypeFilter(task, typeFilter) {
  const key = String(typeFilter || '').trim();
  if (!key || key === 'ALL') return true;
  return String(task.entityType || '').toLowerCase() === key.toLowerCase();
}

/**
 * @param {{ entityType?: string, taskAction?: string, taskTitle?: string, reference?: string | null, regulator?: string | null, status?: string, priority?: string | null }} task
 * @param {string} priority
 */
export function taskMatchesPriorityFilter(task, priority) {
  const key = String(priority || '').trim();
  if (!key || key === 'ALL') return true;
  return String(task.priority || '').toLowerCase() === key.toLowerCase();
}

/**
 * @param {Record<string, unknown>} task
 * @param {string} search
 */
export function taskMatchesSearch(task, search) {
  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    task.taskTitle,
    task.taskAction,
    task.entityType,
    task.reference,
    task.regulator,
    task.status,
    task.priority,
    task.assignedTo,
    task.recordId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** Stable ordering: overdue/due soon first, then due date, then title, then id. */
export function compareMyTasks(a, b) {
  const rank = (t) => {
    if (t.completed) return 4;
    if (t.slaState === 'Overdue') return 0;
    if (t.slaState === 'Due Soon') return 1;
    if (t.awaitingReview) return 2;
    return 3;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const da = a.dueDate ? String(a.dueDate) : '9999-12-31';
  const db = b.dueDate ? String(b.dueDate) : '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  const ta = String(a.taskTitle || '');
  const tb = String(b.taskTitle || '');
  if (ta !== tb) return ta.localeCompare(tb);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * @param {unknown[]} items
 * @param {{ page?: number, pageSize?: number, viewFilter?: string, taskType?: string, priority?: string, search?: string }} query
 */
export function paginateMyTasks(items, query = {}) {
  const pageSize = normaliseMyTasksPageSize(query.pageSize);
  const page = normaliseMyTasksPage(query.page);
  const viewFilter = query.viewFilter || 'OPEN';
  const taskType = query.taskType || 'ALL';
  const priority = query.priority || 'ALL';
  const search = query.search || '';

  const filtered = items.filter(
    (item) =>
      taskMatchesViewFilter(item, viewFilter) &&
      taskMatchesTypeFilter(item, taskType) &&
      taskMatchesPriorityFilter(item, priority) &&
      taskMatchesSearch(item, search),
  );
  const sorted = [...filtered].sort(compareMyTasks);
  const totalItems = sorted.length;
  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 0;
  const safePage = totalPages ? Math.min(page, totalPages) : 1;
  const start = (safePage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  return {
    items: pageItems,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
    viewFilter,
    taskType,
    priority,
    search: search || null,
  };
}

/**
 * @param {Array<{ completed?: boolean, slaState?: string, awaitingReview?: boolean, unassigned?: boolean, assignedTo?: string | null }>} items
 * @param {string} userId
 */
export function summariseMyTaskMetrics(items, userId) {
  const open = items.filter((t) => !t.completed);
  const mineOpen = open.filter((t) => t.assignedTo === userId);
  const overdue = open.filter((t) => t.slaState === 'Overdue' && t.dueDate);
  const dueSoon = open.filter((t) => t.slaState === 'Due Soon' && t.dueDate);
  const awaitingReview = open.filter((t) => t.awaitingReview);
  const completed = items.filter((t) => t.completed);
  return {
    myOpenTasks: mineOpen.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    awaitingMyReview: awaitingReview.filter((t) => t.assignedTo === userId || t.unassigned).length,
    completed: completed.length,
    teamUnassignedOpen: open.filter((t) => t.unassigned).length,
  };
}