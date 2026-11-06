/** Tenant context — production would derive from authenticated session, not client input alone. */

export const DEFAULT_TENANT_ID = 'TEN-DEMO-001';

export function buildTenants() {
  return [
    {
      id: 'TEN-DEMO-001',
      name: 'FORGENIQ Demo Organisation',
      status: 'Active',
      dataRegionMock: 'UK',
      defaultTimezone: 'Europe/London',
      createdAt: '2026-01-01T00:00:00Z',
      configuration: { demo: true },
    },
    {
      id: 'TEN-TEST-002',
      name: 'Isolation Test Tenant (hidden)',
      status: 'Active',
      dataRegionMock: 'UK',
      defaultTimezone: 'Europe/London',
      createdAt: '2026-01-01T00:00:00Z',
      configuration: { testOnly: true },
    },
  ];
}

export function getTenantContext(state) {
  return state.tenantContext || { tenantId: DEFAULT_TENANT_ID };
}

export function entityTenantId(entity) {
  return entity?.tenantId || DEFAULT_TENANT_ID;
}

/** Returns null if record is not visible in current tenant (mock isolation). */
export function assertTenantAccess(state, entity) {
  if (!entity) return { ok: false, code: 'NOT_FOUND', message: 'Record not found.' };
  const ctx = getTenantContext(state);
  const tid = entityTenantId(entity);
  if (tid !== ctx.tenantId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Record not found.' };
  }
  return { ok: true, entity };
}
