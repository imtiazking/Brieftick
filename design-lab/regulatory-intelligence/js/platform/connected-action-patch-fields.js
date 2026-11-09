/**
 * Build PATCH body from the action edit panel — only fields that differ from persisted values.
 */
export function collectConnectedActionPatchFields(panel) {
  if (!panel) return {};
  const norm = (v) => (v == null ? '' : String(v).trim());
  const initial = {
    title: panel.dataset.initialTitle ?? '',
    description: panel.dataset.initialDescription ?? '',
    priority: panel.dataset.initialPriority ?? '',
    due_date: panel.dataset.initialDueDate ?? '',
    status: panel.dataset.initialStatus ?? 'OPEN',
  };
  const fields = {};
  panel.querySelectorAll('[data-connected-action-field]').forEach((el) => {
    const key = el.dataset.connectedActionField;
    if (!key) return;
    const next = el.type === 'date' ? norm(el.value) : key === 'description' ? el.value : norm(el.value);
    const prev = key === 'description' ? initial.description : initial[key] ?? '';
    if (key === 'description' ? next === prev : norm(next) === norm(prev)) return;
    fields[key] = key === 'description' ? next : next;
  });
  const ownerPick = panel.querySelector('[data-connected-action-owner-select]')?.value?.trim();
  if (ownerPick) fields.owner_user_id = ownerPick;
  return fields;
}
