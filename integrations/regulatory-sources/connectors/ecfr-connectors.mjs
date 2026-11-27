import { createEcfrApiConnector } from '../core/ecfr-api-connector.mjs';

/** Title 12 — Banks and Banking (relevant to multiple US RI sources). */
export const ecfrTitle12 = createEcfrApiConnector({
  connectorId: 'CONN-ECFR-TITLE-12',
  regulatorId: 'REG-FRB',
  sourceId: 'SRC-ECFR-TITLE-12',
  titleFilter: [12],
  retrievalMethod: 'official_ecfr_versioner_api',
  publicationType: 'cfr_title_index',
});

export const ECFR_API_CONNECTORS = [ecfrTitle12];