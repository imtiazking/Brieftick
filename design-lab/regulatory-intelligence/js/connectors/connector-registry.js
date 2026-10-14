import { createFcaConnector } from './fca-connector.js';
import { createPraConnector } from './pra-connector.js';
import { createHmtConnector } from './hmt-connector.js';
import { createLegislationConnector } from './legislation-connector.js';
import { createTprConnector } from './tpr-connector.js';
import { createBaselConnector } from './basel-connector.js';
import { CONNECTOR_MODES } from './connector-base.js';

const instances = new Map();

export function getConnectorById(connectorId) {
  if (instances.has(connectorId)) return instances.get(connectorId);
  let c;
  if (connectorId === 'CONN-FCA-001' || connectorId.startsWith('CONN-FCA')) c = createFcaConnector({ id: connectorId });
  else if (connectorId === 'CONN-PRA-001' || connectorId.startsWith('CONN-PRA')) c = createPraConnector({ id: connectorId });
  else if (connectorId === 'CONN-HMT-001' || connectorId.startsWith('CONN-HMT')) c = createHmtConnector({ id: connectorId });
  else if (connectorId === 'CONN-LEG-001' || connectorId.startsWith('CONN-LEG')) c = createLegislationConnector({ id: connectorId });
  else if (connectorId === 'CONN-TPR-001' || connectorId.startsWith('CONN-TPR')) c = createTprConnector({ id: connectorId });
  else if (connectorId === 'CONN-BASEL-001' || connectorId.startsWith('CONN-BASEL')) c = createBaselConnector({ id: connectorId });
  else return null;
  instances.set(connectorId, c);
  return c;
}

export function resolveConnectorMode(platformConfig, connectorRecord) {
  const cfg = platformConfig || {};
  if (cfg.regulatoryConnectorMode) return cfg.regulatoryConnectorMode;
  if (connectorRecord?.executionMode) return connectorRecord.executionMode;
  return CONNECTOR_MODES.FIXTURE;
}

export function liveVerificationAllowed(platformConfig) {
  return Boolean(platformConfig?.allowLiveRegulatoryVerification);
}
