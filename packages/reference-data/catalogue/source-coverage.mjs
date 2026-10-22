/**
 * Semantic coverage audit (separate from integration.verificationStatus).
 * Human-reviewed against manifests, connector routes, and representative fingerprints.
 */

/** @typedef {'COVERAGE_VERIFIED'|'PARTIALLY_VERIFIED'|'CONNECTIVITY_ONLY'|'SEMANTIC_MISMATCH'|'NOT_TESTED'} CoverageVerificationStatus */

/** @typedef {'RULEBOOK'|'PRIMARY_LEGISLATION'|'SECONDARY_LEGISLATION'|'CONSULTATION'|'POLICY_STATEMENT'|'SUPERVISORY_GUIDANCE'|'REGULATORY_NOTICE'|'ENFORCEMENT'|'GENERAL_LICENCE'|'SANCTIONS_POLICY'|'SANCTIONS_DATA'|'NEWS'|'PRESS_RELEASE'|'STANDARD'|'FRAMEWORK'|'CIRCULAR'|'OTHER'} RegulatoryContentClass */

/** @typedef {'HORIZON_SCANNING'|'REGULATORY_CHANGE'|'RULE_OBLIGATION_SOURCE'|'ENFORCEMENT_INTELLIGENCE'|'GUIDANCE_MONITORING'|'APPLICABILITY'|'REFERENCE_ONLY'} RiUseCase */

/** @typedef {'KEEP'|'SPLIT'|'RENAME_LATER'|'ADD_NEW_SOURCE'|'DEPRECATE_LATER'} CatalogueRecommendation */

export const COVERAGE_VERIFICATION_STATUSES = [
  'COVERAGE_VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONNECTIVITY_ONLY',
  'SEMANTIC_MISMATCH',
  'NOT_TESTED',
];

export const REGULATORY_CONTENT_CLASSES = [
  'RULEBOOK',
  'PRIMARY_LEGISLATION',
  'SECONDARY_LEGISLATION',
  'CONSULTATION',
  'POLICY_STATEMENT',
  'SUPERVISORY_GUIDANCE',
  'REGULATORY_NOTICE',
  'ENFORCEMENT',
  'GENERAL_LICENCE',
  'SANCTIONS_POLICY',
  'SANCTIONS_DATA',
  'NEWS',
  'PRESS_RELEASE',
  'STANDARD',
  'FRAMEWORK',
  'CIRCULAR',
  'OTHER',
];

export const RI_USE_CASES = [
  'HORIZON_SCANNING',
  'REGULATORY_CHANGE',
  'RULE_OBLIGATION_SOURCE',
  'ENFORCEMENT_INTELLIGENCE',
  'GUIDANCE_MONITORING',
  'APPLICABILITY',
  'REFERENCE_ONLY',
];

/**
 * @typedef {Object} SourceCoverageRecord
 * @property {CoverageVerificationStatus} coverageVerificationStatus
 * @property {RegulatoryContentClass[]} contentClasses Observed classes from representative retrievals
 * @property {RiUseCase[]} riUseCases Supported RI uses given current route (not production-enabled)
 * @property {CatalogueRecommendation} catalogueRecommendation
 * @property {string} [coverageNotes] Semantic audit rationale
 * @property {string} [missingEndpointHint] Official route still needed for full coverage
 */

/** @type {Record<string, SourceCoverageRecord>} */
export const SOURCE_COVERAGE_BY_ID = {
  'SRC-ICO-GUIDANCE': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['ENFORCEMENT', 'REGULATORY_NOTICE'],
    riUseCases: ['ENFORCEMENT_INTELLIGENCE', 'HORIZON_SCANNING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Sitemap route surfaces ICO decision/enforcement notices, not statutory guidance corpora. Valid for guidance-change monitoring via enforcement precedent; weak as sole GDPR guidance corpus.',
    missingEndpointHint: 'Official guidance/legislative hub pages beyond enforcement sitemap slice.',
  },
  'SRC-PSR-UK-RULES': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'REGULATORY_NOTICE', 'POLICY_STATEMENT'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Publications listing returns PSR rules, written guidance, and work-plan material aligned to payments rules source.',
  },
  'SRC-FRC-PUBLICATIONS': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['NEWS', 'PRESS_RELEASE', 'SUPERVISORY_GUIDANCE', 'ENFORCEMENT'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'ENFORCEMENT_INTELLIGENCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Source name is broad “publications”; route is news listing (guidance releases, sanctions). Matches publications monitoring, not a dedicated standards rulebook feed.',
  },
  'SRC-CMA-UK-ENFORCEMENT': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['ENFORCEMENT', 'REGULATORY_NOTICE', 'PRESS_RELEASE'],
    riUseCases: ['ENFORCEMENT_INTELLIGENCE', 'HORIZON_SCANNING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'GOV.UK Atom feed returns CMA enforcement and case publications as declared.',
  },
  'SRC-OFSI-SANCTIONS-GUIDANCE': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SANCTIONS_POLICY', 'GENERAL_LICENCE', 'SUPERVISORY_GUIDANCE'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'APPLICABILITY', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'General licences and sanctions FAQs — RI policy/guidance; not UK consolidated list data (FC).',
  },
  'SRC-SEC-RULES-PUBLICATIONS': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRESS_RELEASE', 'NEWS'],
    riUseCases: ['HORIZON_SCANNING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Press-release RSS proves connectivity; samples are MOUs/roundtables, not rules. Rulemaking on SRC-SEC-RULEMAKING.',
    missingEndpointHint: 'Deeper SEC rulemaking corpus beyond press RSS.',
  },
  'SRC-FINRA-RULEBOOK': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'RULEBOOK'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Regulatory notices on official rulebook notices path are substantive rule/guidance updates.',
  },
  'SRC-SAMA-RULEBOOK': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['RULEBOOK', 'OTHER'],
    riUseCases: ['REFERENCE_ONLY', 'HORIZON_SCANNING'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Rulebook host verified; sample is portal landing page only — rule nodes need deeper traversal for obligation-grade coverage.',
    missingEndpointHint: 'Sustained rulebook node/detail harvesting on rulebook.sama.gov.sa.',
  },
  'SRC-CMA-SA-RULES': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SECONDARY_LEGISLATION', 'CIRCULAR', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'APPLICABILITY', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Official regulation PDFs from CMA rules index — matches capital-markets rules source.',
  },
  'SRC-DFSA-RULEBOOK': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['RULEBOOK', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Authorised Thomson Reuters rulebook RMIs are genuine DFSA rule amendments.',
  },
  'SRC-CBUAE-DIGITAL-RULEBOOK': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Technical access restricted; semantic coverage of digital rulebook not established.',
    missingEndpointHint: 'Licensed or whitelisted access to rulebook.centralbank.ae content.',
  },
  'SRC-IA-SA-REGULATIONS': {
    coverageVerificationStatus: 'CONNECTIVITY_ONLY',
    contentClasses: ['OTHER'],
    riUseCases: ['REFERENCE_ONLY', 'HORIZON_SCANNING'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Single landing page “Regulations & Licenses” — not demonstrated circulars/rules corpus; cannot sustain regulations/circulars coverage claim.',
    missingEndpointHint: 'IA circulars/regulations library or document index with substantive instruments.',
  },
  'SRC-TADAWUL-RULEBOOK': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'HTTP 403 — exchange rulebook semantic coverage not assessed.',
    missingEndpointHint: 'Official listing/trading rulebook pages on saudiexchange.sa.',
  },
  'SRC-SDAIA-PDPL': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Connector not semantically validated — PDPL route unresolved.',
    missingEndpointHint: 'Official PDPL law, implementing regulations, and guidance index.',
  },
  'SRC-ZATCA-EINVOICING': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Rules index reachable but no extractable regulatory documents in lab pass.',
  },
  'SRC-MOCI-SA-COMPANIES-LAW': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
  },
  'SRC-NCA-SA-FRAMEWORKS': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
  },
  'SRC-SA-LEGISLATION-GAZETTE': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
  },
  'SRC-VARA-RULEBOOK': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['RULEBOOK', 'REGULATORY_NOTICE'],
    riUseCases: ['REFERENCE_ONLY', 'HORIZON_SCANNING', 'GUIDANCE_MONITORING'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'VASP Registry page verified — regulatory registry content, not full rulebook text corpus. News moved to SRC-VARA-REGULATORY-UPDATES.',
    missingEndpointHint: 'Dedicated VARA rulebook/regulatory framework document repository.',
  },
  'SRC-VARA-REGULATORY-UPDATES': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['NEWS', 'REGULATORY_NOTICE', 'PRESS_RELEASE'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Official /en/news — market notices and regulatory announcements (not rulebook obligations).',
  },
  'SRC-SCA-UAE-REGULATIONS': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'No representative regulatory documents retrieved from uaecma.gov.ae listing.',
  },
  'SRC-FSRA-RULEBOOK': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'HTTP 403 on ADGM Thomson Reuters rulebook — semantic rulebook coverage not demonstrated.',
  },
  'SRC-UAE-FIU-GUIDANCE': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'POLICY_STATEMENT'],
    riUseCases: ['GUIDANCE_MONITORING', 'REGULATORY_CHANGE', 'APPLICABILITY', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Policies/guidance pages (STR process, FAQs, understanding the law) match AML/CFT guidance source for RI.',
  },
  'SRC-CFTC-PUBLICATIONS': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRESS_RELEASE', 'ENFORCEMENT'],
    riUseCases: ['ENFORCEMENT_INTELLIGENCE', 'HORIZON_SCANNING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'ADD_NEW_SOURCE',
    coverageNotes:
      '“Publications” is broad; current route is press releases dominated by enforcement actions, not rulemaking/Federal Register releases.',
    missingEndpointHint: 'CFTC rulemaking, final/proposed rules, or interpretive guidance index.',
  },
  'SRC-FRB-SUPERVISION': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRESS_RELEASE', 'ENFORCEMENT', 'POLICY_STATEMENT', 'OTHER'],
    riUseCases: ['HORIZON_SCANNING', 'ENFORCEMENT_INTELLIGENCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Supervision feed is all press releases — includes enforcement terminations but also monetary policy and surveys; weak as dedicated prudential guidance corpus.',
    missingEndpointHint: 'SR letters, supervision manuals, or regulatory reform releases feed.',
  },
  'SRC-FDIC-GUIDANCE': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'REGULATORY_NOTICE'],
    riUseCases: ['GUIDANCE_MONITORING', 'REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'FIL index pattern retrieves Financial Institution Letters and supervisory issuances.',
  },
  'SRC-OCC-BULLETINS': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'REGULATORY_NOTICE'],
    riUseCases: ['GUIDANCE_MONITORING', 'REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Bulletin-only URL pattern from newsroom (e.g. Bulletin 2023-17).',
  },
  'SRC-CFPB-RULES': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SECONDARY_LEGISLATION', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Final-rules index pages (e.g. Regulation B rulemakings).',
  },
  'SRC-CFPB-REGULATORY-UPDATES': {
    coverageVerificationStatus: 'CONNECTIVITY_ONLY',
    contentClasses: ['NEWS', 'PRESS_RELEASE'],
    riUseCases: ['HORIZON_SCANNING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Newsroom RSS — horizon intelligence only.',
  },
  'SRC-OFAC-SDN-LISTS': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'FC sanctions list/dataset source — not lab-verified after semantic split.',
    missingEndpointHint: 'Official SDN/consolidated sanctions list distribution endpoints (FC central source).',
  },
  'SRC-OFAC-REGULATORY-UPDATES': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SANCTIONS_POLICY', 'GENERAL_LICENCE', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'APPLICABILITY', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Recent-actions policy route; distinct from SANCTIONS_DATA.',
  },
  'SRC-SEC-RULEMAKING': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'RULEBOOK'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'rules-regulations index surfaces SRO and exchange rulemaking sections; deepen for final rules corpus.',
  },
  'SRC-CFTC-RULEMAKING': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Federal Register links not extracted from CFTC index in bounded pass.',
    missingEndpointHint: 'Resolvable federalregister.gov document URLs from CFTC rulemaking index.',
  },
  'SRC-NFA-RULEBOOK': {
    coverageVerificationStatus: 'NOT_TESTED',
    contentClasses: [],
    riUseCases: ['REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Technical route unresolved; semantic rulebook/notices coverage not assessed.',
  },
};
