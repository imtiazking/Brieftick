import { BATCH_1_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/batch-1-registry.mjs';
import { BATCH_2_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/batch-2-connectors.mjs';
import { CORE_LEGACY_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/core-legacy-connectors.mjs';
import { SEMANTIC_REMEDIATION_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/semantic-remediation-connectors.mjs';
import { FEDERAL_REGISTER_API_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/federal-register-connectors.mjs';

/** @type {import('../../../../integrations/regulatory-sources/core/rss-connector.mjs').*} */
export const ALL_INGESTION_CONNECTORS = [
  ...BATCH_1_CONNECTORS,
  ...BATCH_2_CONNECTORS,
  ...CORE_LEGACY_CONNECTORS,
  ...SEMANTIC_REMEDIATION_CONNECTORS,
  ...FEDERAL_REGISTER_API_CONNECTORS,
];

export function getConnectorForSource(sourceId) {
  return ALL_INGESTION_CONNECTORS.find((c) => c.sourceId === sourceId) || null;
}
