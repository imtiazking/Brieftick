import { DEFAULT_PLATFORM_CONFIG } from './platform-config.js';
import { APPLICATION_ROLES } from './platform-permissions.js';
import { buildTenants, DEFAULT_TENANT_ID } from './platform-tenant.js';

export function applyPlatformSeed(state) {
  state.platformConfig = { ...DEFAULT_PLATFORM_CONFIG, ...(state.platformConfig || {}) };
  state.platformConfig.schemaVersion = state.schemaVersion || 10;
  if (state.platformConfig.aiExecutionMode == null) state.platformConfig.aiExecutionMode = 'fixture';
  if (state.platformConfig.allowLiveAiVerification == null) state.platformConfig.allowLiveAiVerification = false;
  if (state.platformConfig.regulatoryConnectorMode == null) state.platformConfig.regulatoryConnectorMode = 'fixture';
  if (state.platformConfig.allowLiveRegulatoryVerification == null) state.platformConfig.allowLiveRegulatoryVerification = false;
  state.tenants = buildTenants();
  state.applicationRoles = APPLICATION_ROLES;
  state.tenantContext = { tenantId: DEFAULT_TENANT_ID, resolvedAt: '2026-10-07T00:00:00Z' };
  state.permissionsCatalog = state.applicationRoles;

  enrichPeopleRoles(state);
  stampTenantIds(state);
  seedIsolationFixture(state);
  return state;
}

function enrichPeopleRoles(state) {
  const map = {
    'u-smith': ['AR-RC-MANAGER', 'AR-PLATFORM-ADMIN'],
    'u-shah': ['AR-BUSINESS-OWNER'],
    'u-grant': ['AR-ASSURANCE-REVIEWER', 'AR-COMPLIANCE-REVIEWER'],
    'u-reed': ['AR-REG-ANALYST'],
    'u-walsh': ['AR-REG-ANALYST'],
    'u-walker': ['AR-BUSINESS-OWNER'],
    'u-cole': ['AR-AUDIT-VIEWER'],
  };
  (state.people || []).forEach((p) => {
    if (!p.applicationRoleIds?.length) p.applicationRoleIds = map[p.id] || ['AR-REG-ANALYST'];
  });
}

function stampTenantIds(state) {
  const tid = DEFAULT_TENANT_ID;
  const collections = [
    'publications',
    'changes',
    'assessments',
    'obligations',
    'policies',
    'risks',
    'controls',
    'actions',
    'evidence',
    'assuranceReviews',
    'assuranceFindings',
    'managementAttestations',
    'boardPacks',
  ];
  collections.forEach((key) => {
    (state[key] || []).forEach((row) => {
      if (!row.tenantId) row.tenantId = tid;
    });
  });
  if (state.orgProfile && !state.orgProfile.tenantId) state.orgProfile.tenantId = tid;
}

function seedIsolationFixture(state) {
  state.tenantIsolationFixtures = [
    {
      id: 'CHG-ISO-002',
      tenantId: 'TEN-TEST-002',
      title: 'Hidden cross-tenant regulatory change (test only)',
      materiality: 'High',
    },
  ];
  const ia = state.assessments?.find((a) => a.id === 'IA-0042');
  if (ia && ia.rowVersion == null) ia.rowVersion = 5;
}
