import { BATCH_1_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/batch-1-registry.mjs';
import { BATCH_2_CONNECTORS } from '../../../../../integrations/regulatory-sources/connectors/batch-2-connectors.mjs';

/** @type {import('../../../../integrations/regulatory-sources/core/rss-connector.mjs').*} */
export const ALL_INGESTION_CONNECTORS = [...BATCH_1_CONNECTORS, ...BATCH_2_CONNECTORS];

export function getConnectorForSource(sourceId) {
  return ALL_INGESTION_CONNECTORS.find((c) => c.sourceId === sourceId) || null;
}
