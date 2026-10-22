/** @typedef {'VERIFIED_EXISTING'|'PLANNED'|'RESEARCH_REQUIRED'|'NOT_APPLICABLE'} CatalogueStatus */

/** @typedef {'P0'|'P1'|'P2'|'P3'} CataloguePriority */

/**
 * Integration Lab connector verification (separate from catalogue lifecycle `status`).
 * @typedef {'LIVE_VERIFIED'|'ACCESS_RESTRICTED'|'AUTH_REQUIRED'|'RETRIEVAL_FAILED'|'RESEARCH_REQUIRED'|'NOT_TESTED'} IntegrationVerificationStatus
 */

/**
 * Production connector enablement (separate from verification).
 * @typedef {'NOT_ENABLED'|'ENABLED'|'DISABLED'} ProductionStatus
 */

/**
 * Future production ingestion strategy (planning metadata).
 * @typedef {'DIRECT_OFFICIAL_API'|'DIRECT_OFFICIAL_FEED'|'DIRECT_OFFICIAL_HTML'|'DIRECT_OFFICIAL_DOCUMENT_LIBRARY'|'OFFICIAL_STRUCTURED_ENDPOINT'|'LICENSED_FEED_RECOMMENDED'|'MANUAL_VERIFICATION_REQUIRED'|'ACCESS_RESEARCH_REQUIRED'} ProductionStrategy
 */

/**
 * @typedef {'COVERAGE_VERIFIED'|'PARTIALLY_VERIFIED'|'CONNECTIVITY_ONLY'|'SEMANTIC_MISMATCH'|'NOT_TESTED'} CoverageVerificationStatus
 */

/**
 * @typedef {'RULEBOOK'|'PRIMARY_LEGISLATION'|'SECONDARY_LEGISLATION'|'CONSULTATION'|'POLICY_STATEMENT'|'SUPERVISORY_GUIDANCE'|'REGULATORY_NOTICE'|'ENFORCEMENT'|'GENERAL_LICENCE'|'SANCTIONS_POLICY'|'SANCTIONS_DATA'|'NEWS'|'PRESS_RELEASE'|'STANDARD'|'FRAMEWORK'|'CIRCULAR'|'OTHER'} RegulatoryContentClass
 */

/**
 * @typedef {'HORIZON_SCANNING'|'REGULATORY_CHANGE'|'RULE_OBLIGATION_SOURCE'|'ENFORCEMENT_INTELLIGENCE'|'GUIDANCE_MONITORING'|'APPLICABILITY'|'REFERENCE_ONLY'} RiUseCase
 */

/**
 * @typedef {Object} SourceIntegrationRecord
 * @property {IntegrationVerificationStatus} verificationStatus
 * @property {CoverageVerificationStatus} [coverageVerificationStatus] Semantic fit vs SRC catalogue purpose
 * @property {RegulatoryContentClass[]} [contentClasses] Observed regulatory content classes from lab samples
 * @property {RiUseCase[]} [riUseCases] RI use cases supported by current connector route
 * @property {ProductionStatus} productionStatus
 * @property {string} [verifiedAt] ISO timestamp when LIVE_VERIFIED or last lab attempt
 * @property {string} [verificationEvidenceRef] path#sourceId to Integration Lab evidence JSON
 * @property {string} [verifiedRetrievalMethod] lab connector method id
 * @property {ProductionStrategy} [productionStrategy]
 * @property {string} [canonicalRegulatoryContentUrl] preferred official content entry URL
 * @property {string} [canonicalContentHostname] hostname serving regulatory content
 * @property {string[]} [officialSupportingHostnames] additional official hosts (e.g. document CDN)
 * @property {string} [primaryRegulatorSiteUrl] regulator portal when distinct from content host
 * @property {string} [authorizedRulebookDeliveryHost] licensed/authorised rulebook platform host (not a regulator domain)
 * @property {string} [accessNotes] licensing, TLS, WAF, or DNS notes
 */

/**
 * @typedef {Object} ProductRelevance
 * @property {'none'|'monitoring'|'secondary'|'primary'} [ri]
 * @property {'none'|'monitoring'|'secondary'|'primary'} [fc]
 * @property {'none'|'monitoring'|'secondary'|'primary'} [mi]
 * @property {'none'|'monitoring'|'secondary'|'primary'} [or]
 */

/**
 * @typedef {Object} RegulatorRecord
 * @property {string} regulatorId
 * @property {string} name
 * @property {string} acronym
 * @property {string} jurisdiction
 * @property {string} country
 * @property {string} region
 * @property {string} regulatorType
 * @property {string[]} regulatoryDomains
 * @property {string[]} sectors
 * @property {string} officialBaseUrl
 * @property {CatalogueStatus} status
 * @property {CataloguePriority} priority
 * @property {string} [notes]
 * @property {string} [designLabRegulatorId] aligned frozen lab id when applicable
 */

/**
 * @typedef {Object} RegulatorySourceRecord
 * @property {string} sourceId
 * @property {string} regulatorId
 * @property {string} regulatorName
 * @property {string} acronym
 * @property {string} jurisdiction
 * @property {string} country
 * @property {string} region
 * @property {string} regulatorType
 * @property {string[]} regulatoryDomains
 * @property {string[]} sectors
 * @property {string} officialBaseUrl
 * @property {string} sourceType
 * @property {string} integrationMethod
 * @property {'yes'|'no'|'partial'|'unknown'} apiAvailability
 * @property {'none'|'api_key'|'oauth'|'certificate'|'other'|'unknown'} authenticationRequirement
 * @property {string} updateFrequencyExpectation
 * @property {ProductRelevance} productRelevance
 * @property {CatalogueStatus} status
 * @property {CataloguePriority} priority
 * @property {string} [notes]
 * @property {string} [verificationArtifact] design-lab evidence path reference when VERIFIED_EXISTING
 * @property {SourceIntegrationRecord} [integration] Integration Lab reconciliation metadata
 */

export const CATALOGUE_STATUSES = ['VERIFIED_EXISTING', 'PLANNED', 'RESEARCH_REQUIRED', 'NOT_APPLICABLE'];

export const COVERAGE_VERIFICATION_STATUSES = [
  'COVERAGE_VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONNECTIVITY_ONLY',
  'SEMANTIC_MISMATCH',
  'NOT_TESTED',
];

export const INTEGRATION_VERIFICATION_STATUSES = [
  'LIVE_VERIFIED',
  'ACCESS_RESTRICTED',
  'AUTH_REQUIRED',
  'RETRIEVAL_FAILED',
  'RESEARCH_REQUIRED',
  'NOT_TESTED',
];

export const PRODUCTION_STATUSES = ['NOT_ENABLED', 'ENABLED', 'DISABLED'];

export const PRODUCTION_STRATEGIES = [
  'DIRECT_OFFICIAL_API',
  'DIRECT_OFFICIAL_FEED',
  'DIRECT_OFFICIAL_HTML',
  'DIRECT_OFFICIAL_DOCUMENT_LIBRARY',
  'OFFICIAL_STRUCTURED_ENDPOINT',
  'LICENSED_FEED_RECOMMENDED',
  'MANUAL_VERIFICATION_REQUIRED',
  'ACCESS_RESEARCH_REQUIRED',
];

