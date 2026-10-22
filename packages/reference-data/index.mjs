export { REGULATORS } from './catalogue/regulators.mjs';
export { REGULATORY_SOURCES } from './catalogue/regulatory-sources.mjs';
export {
  CATALOGUE_STATUSES,
  INTEGRATION_VERIFICATION_STATUSES,
  PRODUCTION_STATUSES,
  PRODUCTION_STRATEGIES,
} from './catalogue/types.mjs';
export { SOURCE_INTEGRATION_BY_ID } from './catalogue/source-integration.mjs';

import { REGULATORS } from './catalogue/regulators.mjs';
import { REGULATORY_SOURCES } from './catalogue/regulatory-sources.mjs';

export function getRegulatorById(regulatorId) {
  return REGULATORS.find((r) => r.regulatorId === regulatorId) || null;
}

export function getSourceById(sourceId) {
  return REGULATORY_SOURCES.find((s) => s.sourceId === sourceId) || null;
}

export function sourcesForRegulator(regulatorId) {
  return REGULATORY_SOURCES.filter((s) => s.regulatorId === regulatorId);
}
