import { createHtmlListingConnector } from '../core/html-listing-connector.mjs';
import { createPatternHtmlConnector } from '../core/pattern-html-connector.mjs';

/** Post–semantic-audit connectors (new SRC IDs only; remapped routes updated in batch-2). */

export const varaRulebookProbe = createPatternHtmlConnector({
  connectorId: 'CONN-SEM-VARA-RULEBOOK',
  regulatorId: 'REG-VARA',
  sourceId: 'SRC-VARA-RULEBOOK',
  allowedHosts: ['www.vara.ae', 'vara.ae'],
  listingUrl: 'https://www.vara.ae/en',
  linkPattern: /href="(\/en\/[^"]*(?:rulebook|regulation|framework)[^"]*)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_rulebook_discovery',
  publicationType: 'rule',
});
varaRulebookProbe.productionStrategy = 'DIRECT_OFFICIAL_HTML';

export const cfpbRules = createHtmlListingConnector({
  connectorId: 'CONN-SEM-CFPB-RULES',
  regulatorId: 'REG-CFPB',
  sourceId: 'SRC-CFPB-RULES',
  allowedHosts: ['www.consumerfinance.gov', 'consumerfinance.gov'],
  listingUrl: 'https://www.consumerfinance.gov/rules-policy/final-rules/',
  retrievalMethod: 'official_html_listing',
  publicationType: 'regulation',
});
cfpbRules.productionStrategy = 'DIRECT_OFFICIAL_HTML';

export const secRulemaking = createHtmlListingConnector({
  connectorId: 'CONN-SEM-SEC-RULEMAKING',
  regulatorId: 'REG-SEC',
  sourceId: 'SRC-SEC-RULEMAKING',
  allowedHosts: ['www.sec.gov', 'sec.gov'],
  listingUrl: 'https://www.sec.gov/rules-regulations',
  retrievalMethod: 'official_html_listing',
  publicationType: 'rulemaking',
});
secRulemaking.productionStrategy = 'DIRECT_OFFICIAL_HTML';

export const cftcRulemaking = createPatternHtmlConnector({
  connectorId: 'CONN-SEM-CFTC-RULEMAKING',
  regulatorId: 'REG-CFTC',
  sourceId: 'SRC-CFTC-RULEMAKING',
  allowedHosts: ['www.cftc.gov', 'cftc.gov', 'www.federalregister.gov'],
  listingUrl: 'https://www.cftc.gov/LawRegulation/FederalRegister/index.htm',
  linkPattern: /href="(https:\/\/www\.federalregister\.gov\/documents\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"/gi,
  linkIsPath: false,
  retrievalMethod: 'official_federal_register_link',
  publicationType: 'rulemaking',
});
cftcRulemaking.productionStrategy = 'DIRECT_OFFICIAL_HTML';

export const SEMANTIC_REMEDIATION_CONNECTORS = [
  varaRulebookProbe,
  cfpbRules,
  secRulemaking,
  cftcRulemaking,
];

export const SEMANTIC_REMEDIATION_SOURCE_IDS = SEMANTIC_REMEDIATION_CONNECTORS.map((c) => c.sourceId);
