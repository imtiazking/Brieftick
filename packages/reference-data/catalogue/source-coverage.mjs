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
    coverageNotes:
      'Phase 84J: Open-data policy and landing pages exist on centralbank.ae but programme/staging egress receives HTTP 403 on all tested HTML, sitemap, RSS, legislation, regulatory-development, and rulebook hosts. UAE FCSC catalog API (opendata.fcsc.gov.ae) blocked by Cloudflare from automation. Federal statistical datasets (e.g. Balance of Payments) are not regulatory rulebook publications. Connector disabled; no homepage PASS.',
    missingEndpointHint:
      'Authorised CBUAE publication feed, API credentials, partner/licensed Thomson Reuters rulebook access, or IP allowlisting for centralbank.ae automated retrieval.',
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
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['RULEBOOK', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'PARTIAL: CMA capital-market rules index only (Phase 84D). Saudi Exchange listing/trading rules remain HTTP 403 — not represented as full Tadawul exchange coverage.',
    missingEndpointHint: 'Authorised Saudi Exchange rule publication route when publicly accessible.',
  },
  'SRC-SDAIA-PDPL': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRIMARY_LEGISLATION', 'SECONDARY_LEGISLATION', 'SUPERVISORY_GUIDANCE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Phase 84G: DGP Knowledge Centre English portal — official WCM PDF downloads (PDPL, Implementing Regulation, policies). PARTIAL: static catalogue cards; no unattended change-discovery feed.',
    missingEndpointHint: 'Machine-readable NDMO update feed beyond portal cards.',
  },
  'SRC-ZATCA-EINVOICING': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'REGULATORY_NOTICE'],
    riUseCases: ['GUIDANCE_MONITORING', 'REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'PARTIAL: Help Center guideline pages (Phase 84D). SharePoint Rules library and full tax/zakat legislation corpus not extracted in bounded pass.',
  },
  'SRC-MOCI-SA-COMPANIES-LAW': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRIMARY_LEGISLATION', 'SECONDARY_LEGISLATION'],
    riUseCases: ['REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Phase 84G: TLS fixed via official DigiCert intermediate PEM (incomplete server chain). Regulations retrieved from SharePoint detail pages (HTML instruments; no public PDF). PARTIAL vs full PDF corpus.',
    missingEndpointHint: 'Official downloadable PDF endpoints for mc.gov.sa regulations when published.',
  },
  'SRC-NCA-SA-FRAMEWORKS': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['FRAMEWORK', 'PRIMARY_LEGISLATION', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Official laws-and-regulations index with CDN-hosted PDF instruments (Phase 84D).',
  },
  'SRC-SA-LEGISLATION-GAZETTE': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['PRIMARY_LEGISLATION', 'SECONDARY_LEGISLATION', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'REFERENCE_ONLY', 'HORIZON_SCANNING'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'PARTIAL (Phase 84F): Umm Al-Qura digital site `/news/{category}/{id}` publications — not legacy IssueArchive.aspx PDF issues; Arabic metadata from page content where present.',
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
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'SECONDARY_LEGISLATION'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Phase 84G: Official UAECMA Latest Regulations — PDF via /assets/download/*.aspx with Content-Type application/pdf (Decision 11/2026 verified).',
  },
  'SRC-FSRA-RULEBOOK': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'POLICY_STATEMENT', 'SUPERVISORY_GUIDANCE', 'CONSULTATION'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'PARTIAL: ADGM official publications (consultations, notices, guidance). Binding FSRA rulebook text on Thomson Reuters remains entitlement-blocked.',
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
  'SRC-ECFR-TITLE-12': {
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['RULEBOOK', 'REGULATORY_NOTICE', 'OTHER'],
    riUseCases: ['HORIZON_SCANNING', 'RULE_OBLIGATION_SOURCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Title-level versioner API discovers Title 12 structure; section HTML resolved via ecfr.gov canonical URLs and corpus snapshot path.',
    missingEndpointHint: 'Part/section bulk export if versioner adds structured delta feeds.',
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
  'SRC-SEC-FEDERAL-REGISTER': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'RULEBOOK'],
    riUseCases: ['REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'Federal Register API SEC agency filter; bounded document retrieval for final rules and notices.',
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
    coverageVerificationStatus: 'PARTIALLY_VERIFIED',
    contentClasses: ['RULEBOOK', 'REGULATORY_NOTICE'],
    riUseCases: ['REGULATORY_CHANGE', 'RULE_OBLIGATION_SOURCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'PARTIAL: NFA rulebook section HTML (rules.aspx). Notices to Members and news remain JS-rendered — outside connector coverage.',
  },
  'SRC-FCA-PUBLICATIONS-RSS': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['REGULATORY_NOTICE', 'POLICY_STATEMENT', 'SUPERVISORY_GUIDANCE'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes:
      'Production CONN-LEGACY-FCA mirrors Design Lab RSS route; representative fingerprints in core-legacy verification manifest.',
  },
  'SRC-PRA-PUBLICATIONS': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'POLICY_STATEMENT', 'REGULATORY_NOTICE'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'BoE/PRA publications listing — production html listing connector.',
  },
  'SRC-HMT-PUBLICATIONS': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['POLICY_STATEMENT', 'CONSULTATION', 'REGULATORY_NOTICE'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'HM Treasury GOV.UK atom feed — policy and consultation horizon.',
  },
  'SRC-UK-LEGISLATION-ATOM': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['PRIMARY_LEGISLATION', 'SECONDARY_LEGISLATION'],
    riUseCases: ['HORIZON_SCANNING', 'RULE_OBLIGATION_SOURCE', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'legislation.gov.uk new legislation atom — Design Lab parity via production atom connector.',
  },
  'SRC-TPR-DOCUMENT-LIBRARY': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['SUPERVISORY_GUIDANCE', 'POLICY_STATEMENT', 'REGULATORY_NOTICE'],
    riUseCases: ['HORIZON_SCANNING', 'REGULATORY_CHANGE', 'GUIDANCE_MONITORING', 'REFERENCE_ONLY'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'TPR document library sitemap slice — pensions regulatory publications.',
  },
  'SRC-BASEL-FRAMEWORK': {
    coverageVerificationStatus: 'COVERAGE_VERIFIED',
    contentClasses: ['FRAMEWORK', 'STANDARD'],
    riUseCases: ['HORIZON_SCANNING', 'REFERENCE_ONLY', 'GUIDANCE_MONITORING'],
    catalogueRecommendation: 'KEEP',
    coverageNotes: 'BIS Basel framework pages — international prudential standard monitoring.',
  },
};
