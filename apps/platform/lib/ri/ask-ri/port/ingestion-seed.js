/**
 * Seed regulatory ingestion architecture and link to existing publications (PUB-001, PUB-003, …).
 */
import { mockChecksum } from './ingestion-helpers.js';

export function applyIngestionSeed(state) {
  state.regulatorySources = buildRegulatorySources();
  state.sourceConnectors = buildConnectors();
  state.ingestionRuns = buildIngestionRuns();
  state.rawSourceItems = buildRawItems();
  state.sourceDocumentCatalog = buildSourceDocuments();
  state.sourceSections = buildSourceSections();
  state.changeCandidates = buildChangeCandidates();
  state.ingestionExceptions = buildExceptions();
  state.sourceArtifacts = state.sourceArtifacts || [];
  state.liveVerificationStaging = [];
  state.mockIngestionPendingRawId = 'RAW-ING-PENDING-001';

  linkPublicationsToIngestion(state);
  syncLegacySourceDocuments(state);
  enrichChangesWithSectionIds(state);
  return state;
}

function buildRegulatorySources() {
  return [
    {
      id: 'SRC-FCA',
      name: 'Financial Conduct Authority',
      shortName: 'FCA',
      jurisdiction: 'United Kingdom',
      sourceType: 'regulator',
      baseUrlMock: 'https://www.fca.org.uk',
      officialDomain: 'www.fca.org.uk',
      sourceTrust: 'Official Regulator',
      allowedHosts: ['www.fca.org.uk', 'fca.org.uk'],
      discoveryMechanism: 'fca-publications-rss',
      connectorType: 'rss_publications',
      enabled: true,
      pollingFrequencyMock: 'Every 4 hours',
      lastSuccessfulCheck: '2026-10-06T09:30:00Z',
      lastCheckStatus: 'Completed',
      supportedDocumentTypes: [
        'Policy Statement',
        'Consultation Paper',
        'Finalised Guidance',
        'Letter',
        'Handbook Rule',
        'Publication',
      ],
    },
    {
      id: 'SRC-PRA',
      name: 'Prudential Regulation Authority',
      shortName: 'PRA',
      jurisdiction: 'United Kingdom',
      sourceType: 'regulator',
      baseUrlMock: 'https://www.bankofengland.co.uk',
      officialDomain: 'www.bankofengland.co.uk',
      sourceTrust: 'Official Regulator',
      regulatoryIdentity: 'PRA',
      allowedHosts: ['www.bankofengland.co.uk', 'bankofengland.co.uk'],
      discoveryMechanism: 'boe-publications-rss-pra-filter',
      connectorType: 'rss_publications',
      enabled: true,
      pollingFrequencyMock: 'Every 6 hours',
      lastSuccessfulCheck: '2026-08-20T11:00:00Z',
      lastCheckStatus: 'Completed',
      supportedDocumentTypes: ['Policy Statement', 'Consultation Paper', 'Supervisory Statement', 'Letter', 'Publication'],
    },
    {
      id: 'SRC-BOE',
      name: 'Bank of England',
      shortName: 'BoE',
      jurisdiction: 'United Kingdom',
      sourceType: 'regulator',
      baseUrlMock: 'https://mock.forgeniq.lab/boe',
      connectorType: 'rss',
      enabled: false,
      pollingFrequencyMock: 'Daily',
      lastSuccessfulCheck: null,
      lastCheckStatus: 'Disabled',
      supportedDocumentTypes: ['Publication', 'Letter'],
    },
    {
      id: 'SRC-HMT',
      name: 'HM Treasury',
      shortName: 'HMT',
      authority: 'HM Treasury',
      authorityType: 'Government / Policy',
      sourceRole: 'Horizon Scanning',
      jurisdiction: 'United Kingdom',
      sourceType: 'government',
      baseUrlMock: 'https://www.gov.uk/government/organisations/hm-treasury',
      officialDomain: 'www.gov.uk',
      sourceTrust: 'Official Government Source',
      allowedHosts: ['www.gov.uk', 'gov.uk'],
      discoveryMechanism: 'hmt-govuk-atom',
      connectorType: 'atom_feed',
      enabled: true,
      liveVerificationSupported: true,
      productionPolling: false,
      pollingFrequencyMock: 'Manual',
      lastSuccessfulCheck: null,
      lastCheckStatus: 'Enabled',
      supportedDocumentTypes: [
        'Consultation Paper',
        'Consultation Outcome',
        'Policy Paper',
        'Guidance',
        'Publication',
      ],
    },
    {
      id: 'SRC-LEG',
      name: 'UK Legislation',
      shortName: 'Legislation',
      authority: 'The National Archives',
      authorityType: 'Official Government Legislation Source',
      sourceRole: 'UK Legislation',
      jurisdiction: 'United Kingdom',
      sourceType: 'legislation',
      baseUrlMock: 'https://www.legislation.gov.uk',
      officialDomain: 'www.legislation.gov.uk',
      sourceTrust: 'Official Government Legislation Source',
      allowedHosts: ['www.legislation.gov.uk', 'legislation.gov.uk'],
      discoveryMechanism: 'legislation-govuk-atom',
      connectorType: 'atom_feed',
      enabled: true,
      liveVerificationSupported: true,
      productionPolling: false,
      pollingFrequencyMock: 'Manual',
      lastSuccessfulCheck: null,
      lastCheckStatus: 'Enabled',
      supportedDocumentTypes: ['Legislation', 'UK Public General Act', 'UK Statutory Instrument'],
    },
    {
      id: 'SRC-TPR',
      name: 'The Pensions Regulator',
      shortName: 'TPR',
      authority: 'The Pensions Regulator',
      authorityType: 'Official UK Regulator',
      sourceRole: 'Pension scheme regulation',
      jurisdiction: 'United Kingdom',
      sourceType: 'regulator',
      baseUrlMock: 'https://www.thepensionsregulator.gov.uk',
      officialDomain: 'www.thepensionsregulator.gov.uk',
      sourceTrust: 'Official UK Regulator',
      allowedHosts: ['www.thepensionsregulator.gov.uk', 'thepensionsregulator.gov.uk'],
      discoveryMechanism: 'tpr-sitemap-document-library',
      connectorType: 'sitemap_html',
      enabled: true,
      liveVerificationSupported: true,
      productionPolling: false,
      pollingFrequencyMock: 'Manual',
      lastSuccessfulCheck: null,
      lastCheckStatus: 'Enabled',
      supportedDocumentTypes: [
        'TPR Code',
        'TPR Guidance',
        'TPR Consultation',
        'TPR Statement',
        'TPR Policy',
      ],
    },
    {
      id: 'SRC-BASEL',
      name: 'Basel Committee / BIS',
      shortName: 'BCBS',
      authority: 'Basel Committee on Banking Supervision',
      authorityType: 'International Standard Setter',
      sourceRole: 'International prudential standards',
      jurisdiction: 'International',
      sourceType: 'international_standard',
      baseUrlMock: 'https://www.bis.org/committees/bcbs/basel-framework',
      officialDomain: 'www.bis.org',
      sourceTrust: 'Official International Standard',
      allowedHosts: ['www.bis.org', 'bis.org'],
      discoveryMechanism: 'basel-framework-html',
      connectorType: 'bounded_html',
      enabled: true,
      liveVerificationSupported: true,
      productionPolling: false,
      pollingFrequencyMock: 'Manual',
      lastSuccessfulCheck: null,
      lastCheckStatus: 'Enabled',
      supportedDocumentTypes: [
        'Basel Framework standard',
        'BCBS publication',
        'Consultative document',
        'Implementation report',
      ],
    },
  ];
}

function buildConnectors() {
  return [
    {
      id: 'CONN-FCA-001',
      sourceId: 'SRC-FCA',
      name: 'FCA Publications Connector',
      type: 'document_feed',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.fca.org.uk', 'fca.org.uk'],
      lastRunAt: '2026-10-06T09:00:00Z',
      lastSuccessfulRunAt: '2026-10-06T09:30:00Z',
      nextRunAt: '2026-10-07T13:00:00Z',
      documentsDetectedLastRun: 3,
      errorsLastRun: 0,
      lastRunStatus: 'Completed',
      configurationSummary: 'Mock FCA policy statements, consultations, and handbook updates',
      checkpoint: 'fca-ps26-14',
      connectorVersion: 'FCA-RSS-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 7,
    },
    {
      id: 'CONN-PRA-001',
      sourceId: 'SRC-PRA',
      name: 'PRA Publications Connector',
      type: 'document_feed',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.bankofengland.co.uk', 'bankofengland.co.uk'],
      lastRunAt: '2026-08-20T10:30:00Z',
      lastSuccessfulRunAt: '2026-08-20T11:00:00Z',
      nextRunAt: '2026-10-07T16:00:00Z',
      documentsDetectedLastRun: 1,
      errorsLastRun: 0,
      lastRunStatus: 'Completed',
      configurationSummary: 'Mock PRA supervisory statements and policy communications',
      checkpoint: 'pra-ss4-26',
      connectorVersion: 'PRA-BOE-RSS-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 7,
    },
    {
      id: 'CONN-HMT-001',
      sourceId: 'SRC-HMT',
      name: 'HM Treasury GOV.UK Atom Connector',
      type: 'document_feed',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.gov.uk', 'gov.uk'],
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      nextRunAt: null,
      documentsDetectedLastRun: 0,
      errorsLastRun: 0,
      lastRunStatus: 'Not run',
      configurationSummary: 'Official GOV.UK Atom feed — financial-services horizon scanning (live-verification only)',
      checkpoint: null,
      connectorVersion: 'HMT-GOVUK-ATOM-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 30,
      productionPolling: false,
    },
    {
      id: 'CONN-LEG-001',
      sourceId: 'SRC-LEG',
      name: 'UK Legislation.gov.uk Connector',
      type: 'legislation_feed',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.legislation.gov.uk', 'legislation.gov.uk'],
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      nextRunAt: null,
      documentsDetectedLastRun: 0,
      errorsLastRun: 0,
      lastRunStatus: 'Not run',
      configurationSummary: 'Official legislation.gov.uk Atom feeds — metadata-first (live-verification only)',
      checkpoint: null,
      connectorVersion: 'LEG-GOVUK-ATOM-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 14,
      productionPolling: false,
    },
    {
      id: 'CONN-TPR-001',
      sourceId: 'SRC-TPR',
      name: 'TPR Sitemap / Document Library Connector',
      type: 'sitemap_html',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.thepensionsregulator.gov.uk', 'thepensionsregulator.gov.uk'],
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      nextRunAt: null,
      documentsDetectedLastRun: 0,
      errorsLastRun: 0,
      lastRunStatus: 'Not run',
      configurationSummary: 'Official TPR sitemap-filtered HTML metadata (live-verification only)',
      checkpoint: null,
      connectorVersion: 'TPR-SITEMAP-HTML-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 14,
      productionPolling: false,
    },
    {
      id: 'CONN-BASEL-001',
      sourceId: 'SRC-BASEL',
      name: 'Basel Framework / BCBS Connector',
      type: 'bounded_html',
      enabled: true,
      mode: 'FIXTURE',
      executionMode: 'fixture',
      status: 'Active',
      healthStatus: 'Healthy',
      allowedHosts: ['www.bis.org', 'bis.org'],
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      nextRunAt: null,
      documentsDetectedLastRun: 0,
      errorsLastRun: 0,
      lastRunStatus: 'Not run',
      configurationSummary: 'Official BIS BCBS Basel Framework HTML metadata (live-verification only)',
      checkpoint: null,
      connectorVersion: 'BASEL-BCBS-HTML-1.0',
      parserVersion: 'RI-PARSER-2.0',
      lookbackDays: 14,
      productionPolling: false,
    },
  ];
}

function buildIngestionRuns() {
  return [
    {
      id: 'RUN-2026-001',
      connectorId: 'CONN-FCA-001',
      startedAt: '2026-10-06T09:00:00Z',
      completedAt: '2026-10-06T09:30:00Z',
      status: 'Completed',
      detectedCount: 3,
      newCount: 1,
      updatedCount: 0,
      duplicateCount: 1,
      failedCount: 1,
      checkpointBefore: 'fca-ps26-13',
      checkpointAfter: 'fca-ps26-14',
      errorSummary: '1 retrieval failure (see exceptions)',
      triggeredBy: 'Scheduled mock poll',
    },
    {
      id: 'RUN-2026-002',
      connectorId: 'CONN-PRA-001',
      startedAt: '2026-08-20T10:30:00Z',
      completedAt: '2026-08-20T11:00:00Z',
      status: 'Completed',
      detectedCount: 1,
      newCount: 1,
      updatedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      checkpointBefore: 'pra-ss4-25',
      checkpointAfter: 'pra-ss4-26',
      errorSummary: null,
      triggeredBy: 'Scheduled mock poll',
    },
  ];
}

function buildRawItems() {
  const ps26FingerprintV1 = mockChecksum('PS26/14-v1-mock-body');
  const ps26FingerprintV2 = mockChecksum('PS26/14-v2-mock-body-amended');
  return [
    {
      id: 'RAW-FCA-PS26-14-001',
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      externalIdMock: 'fca:publication:ps26-14',
      detectedAt: '2026-10-06T09:05:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/ps26-14',
      titleRaw: 'FCA Consumer Duty supervisory update',
      referenceRaw: 'PS26/14',
      publicationDateRaw: '2026-10-06',
      contentTypeRaw: 'policy_statement',
      rawMetadata: { topic: 'Consumer Duty / Customer Outcomes', effectiveDate: '2027-01-01' },
      checksumMock: ps26FingerprintV1,
      retrievalStatus: 'Retrieved',
      processingStatus: 'Published to Intake',
      linkedSourceDocumentId: 'DOC-FCA-PS26-14-V1',
      linkedPublicationId: 'PUB-001',
      ingestionRunId: 'RUN-2026-001',
      duplicateClassification: null,
      duplicateReason: null,
    },
    {
      id: 'RAW-FCA-PS26-14-DUP',
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      externalIdMock: 'fca:publication:ps26-14',
      detectedAt: '2026-10-06T09:12:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/ps26-14',
      titleRaw: 'FCA Consumer Duty supervisory update',
      referenceRaw: 'PS26/14',
      publicationDateRaw: '2026-10-06',
      contentTypeRaw: 'policy_statement',
      rawMetadata: {},
      checksumMock: ps26FingerprintV1,
      retrievalStatus: 'Retrieved',
      processingStatus: 'Duplicate',
      linkedSourceDocumentId: 'DOC-FCA-PS26-14-V1',
      linkedPublicationId: 'PUB-001',
      ingestionRunId: 'RUN-2026-001',
      duplicateClassification: 'Exact Duplicate',
      duplicateReason: 'Matching reference PS26/14 and content fingerprint',
    },
    {
      id: 'RAW-FCA-PS26-14-V2',
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      externalIdMock: 'fca:publication:ps26-14',
      detectedAt: '2026-10-05T14:00:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/ps26-14/v2',
      titleRaw: 'FCA Consumer Duty supervisory update (amended)',
      referenceRaw: 'PS26/14',
      publicationDateRaw: '2026-10-06',
      contentTypeRaw: 'policy_statement',
      rawMetadata: { effectiveDate: '2027-01-15' },
      checksumMock: ps26FingerprintV2,
      retrievalStatus: 'Retrieved',
      processingStatus: 'Version Update',
      linkedSourceDocumentId: 'DOC-FCA-PS26-14-V2',
      linkedPublicationId: 'PUB-001',
      ingestionRunId: 'RUN-2026-001',
      duplicateClassification: 'Version Update',
      duplicateReason: 'Same PS26/14 identity with updated implementation date and monitoring wording',
      versionDiffSummary: {
        addedSections: [],
        changedParagraphs: ['Implementation date amended from 2027-01-01 to 2027-01-15', 'Outcome MI frequency clarified'],
        removedSections: [],
        changedDates: [{ field: 'effectiveDate', from: '2027-01-01', to: '2027-01-15' }],
      },
    },
    {
      id: 'RAW-PRA-SS4-26-001',
      sourceId: 'SRC-PRA',
      connectorId: 'CONN-PRA-001',
      externalIdMock: 'pra:publication:ss4-26',
      detectedAt: '2026-08-20T10:45:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/pra/ss4-26',
      titleRaw: 'Operational Resilience Supervisory Statement',
      referenceRaw: 'SS4/26',
      publicationDateRaw: '2026-08-20',
      contentTypeRaw: 'supervisory_statement',
      rawMetadata: { topic: 'Operational Resilience', consultationDeadline: '2026-11-15', effectiveDate: '2027-03-31' },
      checksumMock: mockChecksum('SS4/26-mock-body'),
      retrievalStatus: 'Retrieved',
      processingStatus: 'Published to Intake',
      linkedSourceDocumentId: 'DOC-PRA-SS4-26-V1',
      linkedPublicationId: 'PUB-003',
      ingestionRunId: 'RUN-2026-002',
    },
    {
      id: 'RAW-FCA-FAIL-001',
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      externalIdMock: 'fca:publication:fg26-99',
      detectedAt: '2026-10-06T09:08:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/unavailable/fg26-99',
      titleRaw: 'Draft guidance — systems resilience (unavailable mock)',
      referenceRaw: 'FG26/99',
      publicationDateRaw: '2026-10-06',
      contentTypeRaw: 'finalised_guidance',
      rawMetadata: {},
      checksumMock: null,
      retrievalStatus: 'Failed',
      processingStatus: 'Failed',
      linkedSourceDocumentId: null,
      linkedPublicationId: null,
      ingestionRunId: 'RUN-2026-001',
      failureReason: 'Document unavailable at mock source endpoint',
      retryEligible: true,
      retryCount: 0,
    },
    {
      id: 'RAW-ING-PENDING-001',
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      externalIdMock: 'fca:publication:fg27-3',
      detectedAt: '2026-10-07T08:00:00Z',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/fg27-3',
      titleRaw: 'Operational incident communications — finalised guidance',
      referenceRaw: 'FG27/3',
      publicationDateRaw: '2026-10-07',
      contentTypeRaw: 'finalised_guidance',
      rawMetadata: { topic: 'Operational Resilience / Communications', effectiveDate: '2027-02-01' },
      checksumMock: mockChecksum('FG27/3-mock-body'),
      retrievalStatus: 'Detected',
      processingStatus: 'Detected',
      linkedSourceDocumentId: null,
      linkedPublicationId: null,
      ingestionRunId: null,
      failureReason: null,
      retryEligible: false,
    },
  ];
}

function buildSourceDocuments() {
  const v1Checksum = mockChecksum('PS26/14-v1-mock-body');
  const v2Checksum = mockChecksum('PS26/14-v2-mock-body-amended');
  return [
    {
      id: 'DOC-FCA-PS26-14-V1',
      sourceId: 'SRC-FCA',
      rawSourceItemId: 'RAW-FCA-PS26-14-001',
      publicationId: 'PUB-001',
      title: 'FCA Consumer Duty supervisory update',
      documentReference: 'PS26/14',
      documentType: 'Policy Statement',
      externalIdMock: 'fca:publication:ps26-14',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/ps26-14',
      retrievedAt: '2026-10-06T09:06:00Z',
      publishedAt: '2026-10-06',
      effectiveDate: '2027-01-01',
      consultationDeadline: null,
      mimeTypeMock: 'application/pdf',
      language: 'en',
      checksumMock: v1Checksum,
      documentVersion: 1,
      previousVersionId: null,
      supersedesDocumentId: null,
      isCurrentVersion: false,
      superseded: true,
      processingStatus: 'Ready for Triage',
      pipelineStage: 'Ready for Triage',
      parserVersion: 'MOCK-PARSER-1.2',
      textExtractionStatus: 'Complete',
      pageCountMock: 42,
      sectionCount: 4,
      paragraphCount: 12,
      extractionWarnings: [],
      reanalysisRequired: true,
      provenance: { connectorId: 'CONN-FCA-001', ingestionRunId: 'RUN-2026-001' },
    },
    {
      id: 'DOC-FCA-PS26-14-V2',
      sourceId: 'SRC-FCA',
      rawSourceItemId: 'RAW-FCA-PS26-14-V2',
      publicationId: 'PUB-001',
      title: 'FCA Consumer Duty supervisory update (amended)',
      documentReference: 'PS26/14',
      documentType: 'Policy Statement',
      externalIdMock: 'fca:publication:ps26-14',
      sourceUrlMock: 'https://mock.forgeniq.lab/fca/ps26-14/v2',
      retrievedAt: '2026-10-05T14:05:00Z',
      publishedAt: '2026-10-06',
      effectiveDate: '2027-01-15',
      consultationDeadline: null,
      mimeTypeMock: 'application/pdf',
      language: 'en',
      checksumMock: v2Checksum,
      documentVersion: 2,
      previousVersionId: 'DOC-FCA-PS26-14-V1',
      supersedesDocumentId: 'DOC-FCA-PS26-14-V1',
      isCurrentVersion: true,
      superseded: false,
      processingStatus: 'Ready for Triage',
      pipelineStage: 'Ready for Triage',
      parserVersion: 'MOCK-PARSER-1.2',
      textExtractionStatus: 'Complete',
      pageCountMock: 44,
      sectionCount: 4,
      paragraphCount: 13,
      extractionWarnings: ['Minor formatting variance in mock extract'],
      reanalysisRequired: true,
      versionChangeSummary: {
        changedParagraphs: ['Implementation date amended', 'Outcome MI reporting frequency clarified'],
        changedDates: [{ field: 'effectiveDate', from: '2027-01-01', to: '2027-01-15' }],
      },
      provenance: { connectorId: 'CONN-FCA-001', ingestionRunId: 'RUN-2026-001' },
    },
    {
      id: 'DOC-PRA-SS4-26-V1',
      sourceId: 'SRC-PRA',
      rawSourceItemId: 'RAW-PRA-SS4-26-001',
      publicationId: 'PUB-003',
      title: 'Operational Resilience Supervisory Statement',
      documentReference: 'SS4/26',
      documentType: 'Supervisory Statement',
      externalIdMock: 'pra:publication:ss4-26',
      sourceUrlMock: 'https://mock.forgeniq.lab/pra/ss4-26',
      retrievedAt: '2026-08-20T10:50:00Z',
      publishedAt: '2026-08-20',
      effectiveDate: '2027-03-31',
      consultationDeadline: '2026-11-15',
      mimeTypeMock: 'application/pdf',
      language: 'en',
      checksumMock: mockChecksum('SS4/26-mock-body'),
      documentVersion: 1,
      previousVersionId: null,
      supersedesDocumentId: null,
      isCurrentVersion: true,
      superseded: false,
      processingStatus: 'Ready for Triage',
      pipelineStage: 'Ready for Triage',
      parserVersion: 'MOCK-PARSER-1.2',
      textExtractionStatus: 'Complete',
      pageCountMock: 28,
      sectionCount: 1,
      paragraphCount: 3,
      extractionWarnings: [],
      reanalysisRequired: false,
      provenance: { connectorId: 'CONN-PRA-001', ingestionRunId: 'RUN-2026-002' },
    },
  ];
}

function buildSourceSections() {
  return [
    {
      id: 'SRCSEC-001',
      documentId: 'DOC-FCA-PS26-14-V1',
      publicationId: 'PUB-001',
      heading: '3.12–3.18 Outcome monitoring and remediation (mock)',
      sectionNumber: '3.12-3.18',
      paragraphStart: 1,
      paragraphEnd: 4,
      citation: 'FCA PS26/14 §3.12–3.18',
      citationSlug: '3.12-3.18',
      text: 'DEMO: Outcome monitoring and remediation expectations (mock regulatory text).',
      pageMock: 12,
      order: 2,
    },
    {
      id: 'SRCSEC-002',
      documentId: 'DOC-FCA-PS26-14-V1',
      publicationId: 'PUB-001',
      heading: '3.14 Cohort reporting (mock)',
      sectionNumber: '3.14',
      citation: 'FCA PS26/14 §3.14',
      citationSlug: '3.14',
      text: 'DEMO: Cohort definitions should be meaningful and documented.',
      pageMock: 14,
      order: 3,
    },
    {
      id: 'SRCSEC-003',
      documentId: 'DOC-PRA-SS4-26-V1',
      publicationId: 'PUB-003',
      heading: '4.2 Impact tolerance testing (mock)',
      sectionNumber: '4.2',
      citation: 'PRA SS4/26 §4.2',
      citationSlug: '4.2',
      text: 'DEMO: Firms should test impact tolerances for important business services.',
      pageMock: 8,
      order: 1,
    },
  ];
}

function buildChangeCandidates() {
  return [
    {
      id: 'CC-ING-001',
      publicationId: null,
      rawSourceItemId: 'RAW-ING-PENDING-001',
      sourceSectionIds: [],
      proposedTitle: 'Incident communications to customers and regulators',
      proposedDescription: 'DEMO: Firms should maintain documented communications protocols for operational incidents affecting customers.',
      topic: 'Operational Resilience / Communications',
      materialityRecommendation: 'Medium',
      applicabilityRecommendation: 'Possibly Applicable',
      confidence: 78,
      reasoning: 'DEMO: Retail payments and digital channels may require updated incident communications under operational resilience programmes.',
      status: 'Proposed',
      reviewedBy: null,
      reviewedAt: null,
      acceptedChangeId: null,
      aiGenerated: true,
    },
  ];
}

function buildExceptions() {
  return [
    {
      id: 'EXC-001',
      ingestionRunId: 'RUN-2026-001',
      rawSourceItemId: 'RAW-FCA-FAIL-001',
      type: 'Failed retrieval',
      message: 'Document unavailable at mock source endpoint',
      severity: 'High',
      timestamp: '2026-10-06T09:08:30Z',
    },
    {
      id: 'EXC-002',
      ingestionRunId: 'RUN-2026-001',
      rawSourceItemId: 'RAW-FCA-PS26-14-DUP',
      type: 'Duplicate detected',
      message: 'Exact duplicate suppressed — no new Publication created',
      severity: 'Low',
      timestamp: '2026-10-06T09:12:15Z',
    },
  ];
}

function linkPublicationsToIngestion(state) {
  const pub = (id) => state.publications.find((p) => p.id === id);
  const p1 = pub('PUB-001');
  if (p1) {
    p1.sourceDocumentId = 'DOC-FCA-PS26-14-V2';
    p1.sourceDocumentIds = ['DOC-FCA-PS26-14-V1', 'DOC-FCA-PS26-14-V2'];
    p1.ingestionProvenance = {
      sourceId: 'SRC-FCA',
      connectorId: 'CONN-FCA-001',
      rawSourceItemId: 'RAW-FCA-PS26-14-001',
      ingestionRunId: 'RUN-2026-001',
    };
    p1.reanalysisRequired = true;
    p1.reanalysisReason = 'Source document version 2 detected — human review recommended';
  }
  const p3 = pub('PUB-003');
  if (p3) {
    p3.sourceDocumentId = 'DOC-PRA-SS4-26-V1';
    p3.sourceDocumentIds = ['DOC-PRA-SS4-26-V1'];
    p3.ingestionProvenance = {
      sourceId: 'SRC-PRA',
      connectorId: 'CONN-PRA-001',
      rawSourceItemId: 'RAW-PRA-SS4-26-001',
      ingestionRunId: 'RUN-2026-002',
    };
  }
}

export function syncLegacySourceDocuments(state) {
  if (!state.sourceDocuments) state.sourceDocuments = {};
  const existing = state.sourceDocuments;
  const pubIds = new Set([...Object.keys(existing), 'PUB-001', 'PUB-003', 'PUB-002', 'PUB-004']);
  pubIds.forEach((pubId) => {
    if (existing[pubId]?.sections?.length) return;
  });
  const sectionsForPub = (pubId) =>
    (state.sourceSections || [])
      .filter((s) => s.publicationId === pubId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((s) => {
        const legacy = existing[pubId]?.sections?.find((x) => x.citationSlug === s.citationSlug || x.id === s.sectionNumber);
        return {
          id: s.sectionNumber || s.citationSlug,
          citation: s.citation,
          citationSlug: s.citationSlug,
          heading: s.heading,
          paragraphs: legacy?.paragraphs || [s.text],
          sourceSectionId: s.id,
        };
      });
  ['PUB-001', 'PUB-003'].forEach((pubId) => {
    const doc = state.sourceDocumentCatalog.find((d) => d.publicationId === pubId && d.isCurrentVersion);
    const legacy = existing[pubId];
    const secs = sectionsForPub(pubId);
    if (legacy?.sections?.length && !secs.length) return;
    state.sourceDocuments[pubId] = {
      label: legacy?.label || 'DEMO / MOCK REGULATORY TEXT',
      metadata: {
        mockUrl: doc?.sourceUrlMock || legacy?.metadata?.mockUrl,
        reference: doc?.documentReference || legacy?.metadata?.reference,
        regulator: doc?.sourceId === 'SRC-PRA' ? 'PRA' : 'FCA',
        documentType: doc?.documentType || legacy?.metadata?.documentType,
        ingestedAt: doc?.retrievedAt || legacy?.metadata?.ingestedAt,
        sourceDocumentId: doc?.id,
      },
      sections: legacy?.sections?.length ? legacy.sections.map(enrichSection) : secs,
    };
  });
}

function enrichSection(sec) {
  if (sec.sourceSectionId) return sec;
  if (sec.citationSlug === '3.12-3.18') return { ...sec, sourceSectionId: 'SRCSEC-001' };
  if (sec.citationSlug === '3.14') return { ...sec, sourceSectionId: 'SRCSEC-002' };
  if (sec.citationSlug === '4.2') return { ...sec, sourceSectionId: 'SRCSEC-003' };
  return sec;
}

function enrichChangesWithSectionIds(state) {
  state.changes.forEach((ch) => {
    if (ch.sourceSection === '3.12-3.18' && ch.publicationId === 'PUB-001') ch.sourceSectionId = 'SRCSEC-001';
    if (ch.sourceSection === '3.14' && ch.publicationId === 'PUB-001') ch.sourceSectionId = 'SRCSEC-002';
    if (ch.sourceSection === '4.2' && ch.publicationId === 'PUB-003') ch.sourceSectionId = 'SRCSEC-003';
  });
}
