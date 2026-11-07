import { ALL_INGESTION_CONNECTORS } from '../connector-registry.mjs';

/** @type {Map<string, import('../../../../../integrations/regulatory-sources/core/rss-connector.mjs').*>} */
const BY_SOURCE_ID = new Map(ALL_INGESTION_CONNECTORS.map((c) => [c.sourceId, c]));

export function getProductionConnectorForSource(sourceId) {
  return BY_SOURCE_ID.get(sourceId) ?? null;
}

export function listProductionConnectorSourceIds() {
  return [...BY_SOURCE_ID.keys()];
}

export function listConnectorReadinessMatrix() {
  return ALL_INGESTION_CONNECTORS.map((c) => ({
    connectorId: c.connectorId,
    sourceId: c.sourceId,
    regulatorId: c.regulatorId,
    retrievalMethod: c.retrievalMethod,
    publicationType: c.publicationType,
  }));
}
