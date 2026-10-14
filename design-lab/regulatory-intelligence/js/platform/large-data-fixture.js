/**
 * Opt-in synthetic volume for performance probing (not used in normal demos).
 */
export function applyLargeDataFixture(state, options = {}) {
  const pubCount = options.publications ?? 200;
  const changeCount = options.changes ?? 400;
  const auditCount = options.auditEvents ?? 500;
  const scenario = state.scenarioId || 'consumer-duty';

  for (let i = 0; i < pubCount; i += 1) {
    const id = `PUB-LG-${String(i).padStart(4, '0')}`;
    if (state.publications.some((p) => p.id === id)) continue;
    state.publications.push({
      id,
      title: `Synthetic publication ${i}`,
      regulator: 'FCA',
      scenario,
      triageStatus: 'New',
      workflowStatus: 'New',
      priority: i % 5 === 0 ? 'High' : 'Medium',
      publishedDate: '2026-09-01',
    });
  }

  for (let i = 0; i < changeCount; i += 1) {
    const id = `CHG-LG-${String(i).padStart(4, '0')}`;
    if (state.changes.some((c) => c.id === id)) continue;
    state.changes.push({
      id,
      title: `Synthetic change ${i}`,
      scenario,
      status: 'In Progress',
      materiality: i % 7 === 0 ? 'High' : 'Medium',
      publicationId: state.publications[0]?.id,
    });
  }

  for (let i = 0; i < auditCount; i += 1) {
    const id = `AUD-LG-${String(i).padStart(5, '0')}`;
    state.auditEvents.unshift({
      id,
      timestamp: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      action: 'Synthetic audit event',
      recordType: 'Regulatory Change',
      recordId: state.changes[i % state.changes.length]?.id,
      user: 'System',
      tenantId: state.tenantContext?.tenantId || 'TEN-DEMO-001',
    });
  }

  state._largeDataFixture = { publications: pubCount, changes: changeCount, auditEvents: auditCount, appliedAt: new Date().toISOString() };
  return state;
}
