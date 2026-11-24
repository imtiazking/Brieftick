/**
 * My Tasks — personalised action inbox from GET /api/ri-lab/my-tasks
 */
import { esc, badge, pageHeader, formatDate, dataTable } from '../components.js';
import { getState } from '../store.js';
import { connectedCatalogueBanner, connectedWorkModeBanner } from './connected-display.js';
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function fetchConnectedMyTasks(state = getState(), query = {}) {
  const base = apiBase(state);
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  const res = await fetch(`${base}/my-tasks?${params}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'my_tasks_unavailable');
  return body;
}

function metricCard(label, value, hint = '') {
  return `<div class="ri-metric" data-my-tasks-metric="${esc(label)}">
    <span class="ri-metric__label">${esc(label)}</span>
    <span class="ri-metric__value">${esc(String(value ?? 0))}</span>
    ${hint ? `<span class="ri-muted">${esc(hint)}</span>` : ''}
  </div>`;
}

export function renderConnectedMyTasksShell() {
  const s = getState();
  return `${pageHeader({
    eyebrow: 'REGULATORY INTELLIGENCE',
    title: 'My Tasks',
    subtitle: 'Personalised action inbox — assigned work, reviews and approvals across existing workflows',
    actions: `<a class="ri-btn ri-btn--ghost" href="#/notifications">Attention Centre</a>`,
  })}
    ${connectedCatalogueBanner(s)}
    ${connectedWorkModeBanner(s)}
    <p class="ri-muted">Distinct from the six regulatory triage queues and from Attention Centre alerts. Tasks reflect persisted workflow state only.</p>
    <section class="ri-panel" data-my-tasks-screen data-my-tasks-scope="mine" data-my-tasks-page="1" data-my-tasks-page-size="25" data-my-tasks-view-filter="OPEN" data-my-tasks-task-type="ALL" data-my-tasks-priority="ALL" data-my-tasks-search="">
      <div class="ri-metrics ri-metrics--wrap" data-my-tasks-metrics>
        ${metricCard('My Open Tasks', '…')}
        ${metricCard('Overdue', '…', 'Where due dates exist')}
        ${metricCard('Due Soon', '…', 'Where due dates exist')}
        ${metricCard('Awaiting My Review', '…')}
        ${metricCard('Completed', '…')}
      </div>
      <div class="ri-toolbar ri-toolbar--wrap" data-my-tasks-controls>
        <select class="ri-select" data-my-tasks-scope-select title="Scope">
          <option value="mine">My assigned work</option>
          <option value="team">Team &amp; unassigned pool</option>
        </select>
        <select class="ri-select" data-my-tasks-view-filter title="View">
          <option value="OPEN">My open tasks</option>
          <option value="AWAITING_REVIEW">Awaiting review</option>
          <option value="OVERDUE">Overdue</option>
          <option value="DUE_SOON">Due soon</option>
          <option value="UNASSIGNED">Unassigned</option>
          <option value="COMPLETED">Completed</option>
          <option value="ALL">All</option>
        </select>
        <select class="ri-select" data-my-tasks-task-type title="Task type">
          <option value="ALL">All types</option>
          <option value="AI finding">AI finding</option>
          <option value="Obligation">Obligation</option>
          <option value="Obligation approval">Obligation approval</option>
          <option value="Impact Assessment">Impact assessment</option>
          <option value="Regulatory Change">Regulatory change</option>
          <option value="Action">Action</option>
          <option value="Publication">Publication</option>
        </select>
        <select class="ri-select" data-my-tasks-priority title="Priority">
          <option value="ALL">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <input type="search" class="ri-input" data-my-tasks-search placeholder="Search tasks…" style="min-width:12rem" />
        <select class="ri-select" data-my-tasks-page-size-select title="Page size">
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>
      <p class="ri-muted" data-my-tasks-status>Loading tasks…</p>
      <div data-my-tasks-rows></div>
      <nav class="ri-pagination" data-my-tasks-pagination hidden>
        <button type="button" class="ri-btn ri-btn--ghost" data-my-tasks-prev disabled>Previous</button>
        <span data-my-tasks-page-info></span>
        <button type="button" class="ri-btn ri-btn--ghost" data-my-tasks-next disabled>Next</button>
      </nav>
    </section>`;
}

function renderTaskRows(items) {
  if (!items?.length) {
    return dataTable(
      ['Task', 'Type', 'Reference', 'Regulator', 'Priority', 'Assigned To', 'Due Date', 'Status', 'Action'],
      [],
      'No tasks match the current filters',
    );
  }
  const rows = items.map((t) => {
    const rowClass = t.overdue ? 'ri-row--danger' : t.dueSoon ? 'ri-row--warn' : '';
    const assignee = t.assignedTo ? esc(t.assignedTo.slice(0, 12)) : t.unassigned ? badge('Unassigned') : '—';
    return `<tr class="${rowClass}" data-my-tasks-row data-task-id="${esc(t.id)}">
      <td class="ri-table__title">${esc(t.taskAction)}<br/><span class="ri-muted">${esc(t.taskTitle)}</span></td>
      <td>${esc(t.entityType)}</td>
      <td class="ri-mono">${esc(t.reference || '—')}</td>
      <td>${t.regulator ? badge(t.regulator) : '—'}</td>
      <td>${t.priority ? badge(t.priority) : '—'}</td>
      <td>${assignee}</td>
      <td>${t.dueDate ? formatDate(t.dueDate) : '—'}</td>
      <td>${badge(t.status)} ${t.slaState && t.dueDate ? badge(t.slaState) : ''}</td>
      <td><a class="ri-btn ri-btn--sm ri-btn--primary" href="${esc(t.href)}">Open</a></td>
    </tr>`;
  });
  return dataTable(
    ['Task', 'Type', 'Reference', 'Regulator', 'Priority', 'Assigned To', 'Due Date', 'Status', 'Action'],
    rows,
    'No tasks',
  );
}

function updateMetrics(screen, metrics) {
  const host = screen.querySelector('[data-my-tasks-metrics]');
  if (!host || !metrics) return;
  host.innerHTML = `
    ${metricCard('My Open Tasks', metrics.myOpenTasks)}
    ${metricCard('Overdue', metrics.overdue, 'Where due dates exist')}
    ${metricCard('Due Soon', metrics.dueSoon, 'Where due dates exist')}
    ${metricCard('Awaiting My Review', metrics.awaitingMyReview)}
    ${metricCard('Completed', metrics.completed)}
  `;
}

function updatePagination(screen, pagination) {
  const nav = screen.querySelector('[data-my-tasks-pagination]');
  if (!nav || !pagination) return;
  nav.hidden = pagination.totalPages <= 1;
  const prev = nav.querySelector('[data-my-tasks-prev]');
  const next = nav.querySelector('[data-my-tasks-next]');
  const info = nav.querySelector('[data-my-tasks-page-info]');
  if (prev) prev.disabled = !pagination.hasPreviousPage;
  if (next) next.disabled = !pagination.hasNextPage;
  if (info) {
    info.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1} · ${pagination.totalItems} task(s)`;
  }
}

export async function loadConnectedMyTasksScreen(screen, doc = document) {
  if (!screen) return;
  const scope = screen.dataset.myTasksScope || 'mine';
  const query = {
    scope,
    page: screen.dataset.myTasksPage || '1',
    pageSize: screen.dataset.myTasksPageSize || '25',
    viewFilter: screen.dataset.myTasksViewFilter || 'OPEN',
    taskType: screen.dataset.myTasksTaskType || 'ALL',
    priority: screen.dataset.myTasksPriority || 'ALL',
    search: screen.dataset.myTasksSearch || '',
  };
  const loadKey = JSON.stringify(query);
  if (screen.dataset.loadKey === loadKey) return;
  screen.dataset.loadKey = loadKey;
  const status = screen.querySelector('[data-my-tasks-status]');
  if (status) status.textContent = 'Loading tasks from staging…';
  try {
    const body = await fetchConnectedMyTasks(getState(), query);
    updateMetrics(screen, body.metrics);
    const rowsHost = screen.querySelector('[data-my-tasks-rows]');
    if (rowsHost) rowsHost.innerHTML = renderTaskRows(body.items);
    updatePagination(screen, body.pagination);
    if (status) {
      status.textContent = `Scope: ${scope === 'team' ? 'team & unassigned pool' : 'my assigned work'} · filtered total ${body.filteredTotal ?? body.items?.length ?? 0}`;
    }
  } catch (e) {
    if (status) status.textContent = e?.message || 'My Tasks unavailable';
  }
}

function bindMyTasksControls(screen, doc) {
  if (screen.dataset.controlsBound === '1') return;
  screen.dataset.controlsBound = '1';

  const reload = () => {
    screen.dataset.loadKey = '';
    loadConnectedMyTasksScreen(screen, doc);
  };

  screen.querySelector('[data-my-tasks-scope-select]')?.addEventListener('change', (e) => {
    screen.dataset.myTasksScope = e.target.value;
    screen.dataset.myTasksPage = '1';
    reload();
  });

  screen.querySelector('[data-my-tasks-view-filter]')?.addEventListener('change', (e) => {
    screen.dataset.myTasksViewFilter = e.target.value;
    screen.dataset.myTasksPage = '1';
    reload();
  });
  screen.querySelector('[data-my-tasks-task-type]')?.addEventListener('change', (e) => {
    screen.dataset.myTasksTaskType = e.target.value;
    screen.dataset.myTasksPage = '1';
    reload();
  });
  screen.querySelector('[data-my-tasks-priority]')?.addEventListener('change', (e) => {
    screen.dataset.myTasksPriority = e.target.value;
    screen.dataset.myTasksPage = '1';
    reload();
  });

  let searchTimer = null;
  const searchEl = screen.querySelector('[data-my-tasks-search]');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        screen.dataset.myTasksSearch = searchEl.value.trim();
        screen.dataset.myTasksPage = '1';
        reload();
      }, 350);
    });
  }

  screen.querySelector('[data-my-tasks-page-size-select]')?.addEventListener('change', (e) => {
    screen.dataset.myTasksPageSize = e.target.value;
    screen.dataset.myTasksPage = '1';
    reload();
  });

  const nav = screen.querySelector('[data-my-tasks-pagination]');
  nav?.addEventListener('click', (event) => {
    if (event.target.closest('[data-my-tasks-prev]') && !event.target.closest('[data-my-tasks-prev]').disabled) {
      screen.dataset.myTasksPage = String(Math.max(1, Number(screen.dataset.myTasksPage || '1') - 1));
      reload();
    }
    if (event.target.closest('[data-my-tasks-next]') && !event.target.closest('[data-my-tasks-next]').disabled) {
      screen.dataset.myTasksPage = String(Number(screen.dataset.myTasksPage || '1') + 1);
      reload();
    }
  });
}

export function hydrateConnectedMyTasks(doc = document) {
  if (!isConnectedBackendActive(getState())) return;
  const screen = doc.querySelector('[data-my-tasks-screen]');
  if (!screen) return;
  bindMyTasksControls(screen, doc);
  loadConnectedMyTasksScreen(screen, doc);
}