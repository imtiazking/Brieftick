/**
 * Application service facade — UI should prefer this over direct persistence access.
 */
import { getLocalPlatformAdapter } from '../adapters/local-platform-adapter.js';
import { createApiPlatformAdapter } from '../adapters/api-platform-adapter.js';
import { can, assertPermission, APPLICATION_ROLES, PERMISSIONS } from '../platform/platform-permissions.js';

let apiAdapter = null;

export function getPlatform() {
  const local = getLocalPlatformAdapter();
  const config = local.getConfig();
  if (config.adapterMode === 'api' && config.featureFlags?.apiAdapter) {
    if (!apiAdapter) apiAdapter = createApiPlatformAdapter();
    return apiAdapter;
  }
  return local;
}

export function getApiAdapterContract() {
  return createApiPlatformAdapter();
}

export { can, assertPermission, APPLICATION_ROLES, PERMISSIONS };

export const platform = {
  get activeAdapter() {
    return getPlatform().mode;
  },
  get isApiConfigured() {
    return false;
  },
  publications: {
    getById: (id) => getPlatform().getPublication(id),
  },
  changes: {
    getById: (id) => getPlatform().getChange(id),
    list: () => getPlatform().listChanges(),
  },
  assessments: {
    getById: (id) => getPlatform().getAssessment(id),
  },
  tenant: {
    context: () => getPlatform().getTenantContext(),
  },
  authorize: (permission, resource) => getPlatform().authorize(permission, resource),
};
