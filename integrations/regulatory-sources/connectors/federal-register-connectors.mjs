import { createFederalRegisterApiConnector } from '../core/federal-register-api-connector.mjs';

export const secFederalRegister = createFederalRegisterApiConnector({
  connectorId: 'CONN-FR-SEC',
  regulatorId: 'REG-SEC',
  sourceId: 'SRC-SEC-FEDERAL-REGISTER',
  agencySlugs: ['securities-and-exchange-commission'],
  retrievalMethod: 'official_federal_register_api',
  publicationType: 'federal_register_document',
});

export const cftcFederalRegisterRulemaking = createFederalRegisterApiConnector({
  connectorId: 'CONN-FR-CFTC-RULEMAKING',
  regulatorId: 'REG-CFTC',
  sourceId: 'SRC-CFTC-RULEMAKING',
  agencySlugs: ['commodity-futures-trading-commission'],
  retrievalMethod: 'official_federal_register_api',
  publicationType: 'rulemaking',
});

export const FEDERAL_REGISTER_API_CONNECTORS = [secFederalRegister, cftcFederalRegisterRulemaking];
