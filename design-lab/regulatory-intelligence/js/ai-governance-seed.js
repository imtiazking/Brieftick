/**
 * AI governance seed — engines, models, analyses, claims, reviews (schema v6).
 */
export function applyAiGovernanceSeed(state) {
  state.aiEngines = buildEngines();
  state.aiModels = buildModels();
  state.aiPromptConfigs = buildPromptConfigs();
  state.aiGovernancePolicies = buildPolicies();
  state.aiUseCases = buildUseCases();
  state.organisationProfileVersions = buildOrgProfileVersions();
  state.organisationProfileFactors = buildOrgFactors();
  state.aiClaims = [];
  state.aiAnalyses = buildAnalyses(state);
  state.aiReviews = buildReviews();
  enrichSourceSections(state);
  linkEntities(state);
  syncPublicationAnalysis(state);
  return state;
}

function buildEngines() {
  return [
    {
      id: 'AIENG-RI-001',
      name: 'FORGENIQ Regulatory Intelligence AI',
      description: 'Deterministic demo engine for regulatory interpretation and change analysis (MOCK).',
      mode: 'Demo / deterministic',
      owner: 'Head of Regulatory Change',
      status: 'Active',
      approvedForUseCases: ['UC-RI-001', 'UC-RI-002', 'UC-RI-003', 'UC-RI-004'],
      restrictedUseCases: [],
      currentModelId: 'MODEL-RI-2.2',
      currentPromptSetId: 'PROMPT-REG-CHANGE-04',
      version: 'RI-DEMO-1.0',
      effectiveFrom: '2026-01-01',
    },
  ];
}

function buildModels() {
  return [
    {
      id: 'MODEL-RI-2.1',
      name: 'FORGENIQ Regulatory Analysis Model 2.1 — DEMO',
      providerMock: 'FORGENIQ (mock)',
      familyMock: 'Regulatory interpretation',
      version: '2.1',
      releaseDate: '2026-06-01',
      status: 'Deprecated',
      riskRating: 'High Governance Sensitivity',
      approvedUseCases: ['UC-RI-001', 'UC-RI-002', 'UC-RI-003'],
      prohibitedUseCases: [],
      replacedModelId: null,
      notes: 'Superseded by 2.2 for applicability and change interpretation.',
    },
    {
      id: 'MODEL-RI-2.2',
      name: 'FORGENIQ Regulatory Analysis Model 2.2 — DEMO',
      providerMock: 'FORGENIQ (mock)',
      familyMock: 'Regulatory interpretation',
      version: '2.2',
      releaseDate: '2026-10-01',
      status: 'Active',
      riskRating: 'High Governance Sensitivity',
      approvedUseCases: ['UC-RI-001', 'UC-RI-002', 'UC-RI-003', 'UC-RI-004'],
      prohibitedUseCases: [],
      replacedModelId: 'MODEL-RI-2.1',
      changeSummary: 'Improved cohort-MI interpretation and citation alignment (demo metadata only).',
      effectiveFrom: '2026-10-01',
      activationApprovalStatus: 'Approved',
      activationApprovedById: 'u-smith',
    },
  ];
}

function buildPromptConfigs() {
  return [
    {
      id: 'PROMPT-REG-CHANGE-03',
      name: 'Regulatory Change Interpretation',
      version: '3.0',
      purpose: 'Interpret regulatory changes against organisation profile',
      analysisType: 'Regulatory Change Interpretation',
      status: 'Deprecated',
      effectiveFrom: '2026-06-01',
      sourceRequirements: 'Source document sections required',
      organisationProfileRequired: true,
      citationRequired: true,
      humanReviewPolicyId: 'AIGOV-POL-001',
      changeSummary: 'Baseline demo configuration',
      previousVersionId: null,
    },
    {
      id: 'PROMPT-REG-CHANGE-04',
      name: 'Regulatory Change Interpretation',
      version: '4.0',
      purpose: 'Interpret regulatory changes with claim-level citations',
      analysisType: 'Applicability Recommendation',
      status: 'Active',
      effectiveFrom: '2026-10-01',
      sourceRequirements: 'Source document sections required',
      organisationProfileRequired: true,
      citationRequired: true,
      humanReviewPolicyId: 'AIGOV-POL-001',
      changeSummary: 'Claim-level grounding and quality gate checks',
      previousVersionId: 'PROMPT-REG-CHANGE-03',
    },
  ];
}

function buildPolicies() {
  return [
    {
      id: 'AIGOV-POL-001',
      name: 'Regulatory Applicability AI Review Policy',
      analysisTypes: ['Applicability Recommendation', 'Regulatory Change Interpretation'],
      minimumConfidence: 70,
      groundingRequired: true,
      citationRequired: true,
      humanReviewRequired: true,
      mandatoryReviewBelowConfidence: 70,
      blockIfUnsupportedClaims: true,
      highMaterialityAlwaysHumanReview: true,
      overrideJustificationRequired: true,
      active: true,
    },
  ];
}

function buildUseCases() {
  return [
    {
      id: 'UC-RI-001',
      name: 'Regulatory Publication Classification',
      description: 'Classify incoming publications for triage (MOCK).',
      ownerId: 'u-smith',
      riskClassification: 'Moderate',
      humanOversightRequired: true,
      sourceGroundingRequired: true,
      status: 'Active',
      approvedModelIds: ['MODEL-RI-2.1', 'MODEL-RI-2.2'],
      policyId: 'AIGOV-POL-001',
      analysisTypes: ['Publication Classification'],
    },
    {
      id: 'UC-RI-002',
      name: 'Regulatory Change Extraction',
      description: 'Extract candidate changes from source sections (MOCK).',
      ownerId: 'u-okonkwo',
      riskClassification: 'High Governance Sensitivity',
      humanOversightRequired: true,
      sourceGroundingRequired: true,
      status: 'Active',
      approvedModelIds: ['MODEL-RI-2.1', 'MODEL-RI-2.2'],
      policyId: 'AIGOV-POL-001',
      analysisTypes: ['Regulatory Change Extraction'],
    },
    {
      id: 'UC-RI-003',
      name: 'Applicability Recommendation',
      description: 'Recommend applicability for regulatory changes (MOCK).',
      ownerId: 'u-reed',
      riskClassification: 'High Governance Sensitivity',
      humanOversightRequired: true,
      sourceGroundingRequired: true,
      status: 'Active',
      approvedModelIds: ['MODEL-RI-2.1', 'MODEL-RI-2.2'],
      policyId: 'AIGOV-POL-001',
      analysisTypes: ['Applicability Recommendation'],
    },
    {
      id: 'UC-RI-004',
      name: 'Impact Suggestion',
      description: 'Suggest impact areas for assessments (MOCK).',
      ownerId: 'u-grant',
      riskClassification: 'Moderate',
      humanOversightRequired: true,
      sourceGroundingRequired: true,
      status: 'Active',
      approvedModelIds: ['MODEL-RI-2.2'],
      policyId: 'AIGOV-POL-001',
      analysisTypes: ['Impact Suggestion'],
    },
  ];
}

function buildOrgProfileVersions() {
  return [
    {
      id: 'ORG-DEMO-04',
      effectiveFrom: '2026-01-01',
      status: 'Superseded',
      changeSummary: 'Baseline demo profile',
      factorIds: ['ORGFACT-001', 'ORGFACT-002', 'ORGFACT-003', 'ORGFACT-004'],
    },
    {
      id: 'ORG-DEMO-05',
      effectiveFrom: '2026-10-01',
      status: 'Active',
      changeSummary: 'Added SME lending product scope (demo)',
      factorIds: ['ORGFACT-001', 'ORGFACT-002', 'ORGFACT-003', 'ORGFACT-004', 'ORGFACT-005'],
      newFactorIds: ['ORGFACT-005'],
    },
  ];
}

function buildOrgFactors() {
  return [
    { id: 'ORGFACT-001', label: 'Retail current accounts', category: 'Product' },
    { id: 'ORGFACT-002', label: 'UK retail customers', category: 'Customer' },
    { id: 'ORGFACT-003', label: 'Vulnerable customer population', category: 'Customer' },
    { id: 'ORGFACT-004', label: 'Retail Banking business line', category: 'Business line' },
    { id: 'ORGFACT-005', label: 'SME lending (new)', category: 'Product' },
  ];
}

function claim(id, analysisId, type, text, confidence, sectionIds, grounding, citationStatus, materiality = 'High') {
  return {
    id,
    analysisId,
    claimType: type,
    text,
    confidence,
    sourceSectionIds: sectionIds || [],
    groundingStatus: grounding,
    citationStatus: citationStatus || (sectionIds?.length ? 'Supported' : 'Missing'),
    reviewerStatus: 'Not Reviewed',
    materiality,
    accepted: null,
  };
}

function buildAnalyses(state) {
  const analyses = [
    {
      id: 'AIA-PUB-001-V1',
      analysisType: 'Publication Classification',
      entityType: 'Publication',
      entityId: 'PUB-001',
      publicationId: 'PUB-001',
      sourceDocumentIds: ['DOC-FCA-PS26-14-V1'],
      sourceSectionIds: ['SRCSEC-001'],
      organisationProfileVersion: 'ORG-DEMO-04',
      analysisEngineId: 'AIENG-RI-001',
      modelId: 'MODEL-RI-2.1',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      analysisConfigId: 'PROMPT-REG-CHANGE-03',
      generatedAt: '2026-10-06T09:02:00Z',
      status: 'Complete',
      confidence: 87,
      groundingStatus: 'Fully Supported',
      humanReviewRequired: false,
      humanReviewStatus: 'Accepted',
      outputVersion: 1,
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-001',
      riskClassification: 'Moderate',
      recommendations: [{ type: 'Classification', value: 'Consumer Duty / Outcomes', confidence: 87 }],
      explainability: {
        recommendation: 'High relevance — Consumer Duty outcomes monitoring',
        reasoningFactors: ['ORGFACT-004', 'ORGFACT-002', 'matched regulated activity'],
        sourceEvidence: ['SRCSEC-001'],
        limitations: ['Source wording may require Legal review for implementation scope.'],
      },
      qualityGate: { result: 'Pass', checks: [] },
      metadata: { sourceDocumentVersion: 'V1' },
    },
    {
      id: 'AIA-CHG-001-V1',
      analysisType: 'Applicability Recommendation',
      entityType: 'Regulatory Change',
      entityId: 'CHG-001',
      publicationId: 'PUB-001',
      changeId: 'CHG-001',
      materiality: 'High',
      sourceDocumentIds: ['DOC-FCA-PS26-14-V1'],
      sourceSectionIds: ['SRCSEC-001'],
      organisationProfileVersion: 'ORG-DEMO-04',
      analysisEngineId: 'AIENG-RI-001',
      modelId: 'MODEL-RI-2.1',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      generatedAt: '2026-10-06T09:15:00Z',
      status: 'Complete',
      confidence: 86,
      groundingStatus: 'Fully Supported',
      humanReviewRequired: true,
      outputVersion: 1,
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-003',
      riskClassification: 'High Governance Sensitivity',
      recommendations: [{ type: 'Applicability', value: 'Applicable', confidence: 86 }],
      explainability: {
        recommendation: 'Applicable — retail outcomes monitoring uplift required',
        reasoningFactors: ['ORGFACT-001', 'ORGFACT-002', 'ORGFACT-003', 'ORGFACT-004', 'source terminology: outcome monitoring'],
        sourceEvidence: ['SRCSEC-001'],
        limitations: ['Implementation timing should be confirmed against effective date.'],
      },
      qualityGate: { result: 'Pass', checks: [] },
      reanalysisStatus: 'Re-analysis Recommended',
      reanalysisReason: 'MODEL-RI-2.2 activated',
      supersededByAnalysisId: 'AIA-CHG-001-V2',
      metadata: { sourceDocumentVersion: 'V1' },
    },
    {
      id: 'AIA-CHG-001-V2',
      analysisType: 'Applicability Recommendation',
      entityType: 'Regulatory Change',
      entityId: 'CHG-001',
      publicationId: 'PUB-001',
      changeId: 'CHG-001',
      materiality: 'High',
      sourceDocumentIds: ['DOC-FCA-PS26-14-V1'],
      sourceSectionIds: ['SRCSEC-001', 'SRCSEC-002'],
      organisationProfileVersion: 'ORG-DEMO-04',
      analysisEngineId: 'AIENG-RI-001',
      modelId: 'MODEL-RI-2.2',
      promptConfigId: 'PROMPT-REG-CHANGE-04',
      generatedAt: '2026-10-07T08:00:00Z',
      status: 'Complete',
      confidence: 91,
      groundingStatus: 'Fully Supported',
      humanReviewRequired: false,
      outputVersion: 2,
      supersedesAnalysisId: 'AIA-CHG-001-V1',
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-003',
      recommendations: [{ type: 'Applicability', value: 'Applicable', confidence: 91 }],
      explainability: {
        recommendation: 'Applicable — cohort MI and outcome monitoring uplift',
        reasoningFactors: ['ORGFACT-001', 'ORGFACT-004', 'SRCSEC-002 cohort reporting'],
        sourceEvidence: ['SRCSEC-001', 'SRCSEC-002'],
        limitations: [],
      },
      qualityGate: { result: 'Pass', checks: [] },
      metadata: { sourceDocumentVersion: 'V1' },
    },
    {
      id: 'AIA-CHG-003-V1',
      analysisType: 'Applicability Recommendation',
      entityType: 'Regulatory Change',
      entityId: 'CHG-003',
      publicationId: 'PUB-001',
      changeId: 'CHG-003',
      materiality: 'Medium',
      sourceDocumentIds: ['DOC-FCA-PS26-14-V1'],
      sourceSectionIds: ['SRCSEC-001'],
      organisationProfileVersion: 'ORG-DEMO-04',
      modelId: 'MODEL-RI-2.1',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      analysisEngineId: 'AIENG-RI-001',
      generatedAt: '2026-10-06T10:07:00Z',
      status: 'Complete',
      confidence: 74,
      groundingStatus: 'Partially Supported',
      humanReviewRequired: true,
      recommendations: [{ type: 'Applicability', value: 'Review Required', confidence: 74 }],
      explainability: {
        recommendation: 'Review Required — committee reporting overlap',
        reasoningFactors: ['ORGFACT-004', 'existing committee MI'],
        sourceEvidence: ['SRCSEC-001'],
        limitations: ['Legal interpretation may narrow scope.'],
      },
      qualityGate: { result: 'Pass with Warnings', checks: [] },
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-003',
    },
    {
      id: 'AIA-CHG-013-V1',
      analysisType: 'Applicability Recommendation',
      entityType: 'Regulatory Change',
      entityId: 'CHG-013',
      publicationId: 'PUB-009',
      changeId: 'CHG-013',
      materiality: 'Medium',
      sourceDocumentIds: [],
      sourceSectionIds: [],
      organisationProfileVersion: 'ORG-DEMO-04',
      modelId: 'MODEL-RI-2.1',
      analysisEngineId: 'AIENG-RI-001',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      generatedAt: '2026-10-02T11:00:00Z',
      status: 'Complete',
      confidence: 64,
      groundingStatus: 'Partially Supported',
      humanReviewRequired: true,
      recommendations: [{ type: 'Applicability', value: 'Possibly Applicable', confidence: 64 }],
      explainability: {
        recommendation: 'Possibly Applicable — limited source grounding in demo',
        reasoningFactors: ['financial crime thematic alignment'],
        sourceEvidence: [],
        limitations: ['Low confidence — mandatory human review.'],
      },
      qualityGate: { result: 'Pass with Warnings', checks: [] },
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-003',
    },
    {
      id: 'AIA-CHG-010-V1',
      analysisType: 'Applicability Recommendation',
      entityType: 'Regulatory Change',
      entityId: 'CHG-010',
      publicationId: 'PUB-003',
      changeId: 'CHG-010',
      materiality: 'High',
      sourceDocumentIds: ['DOC-PRA-SS4-26-V1'],
      sourceSectionIds: ['SRCSEC-003', 'SRCSEC-004', 'SRCSEC-005'],
      organisationProfileVersion: 'ORG-DEMO-04',
      modelId: 'MODEL-RI-2.1',
      analysisEngineId: 'AIENG-RI-001',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      generatedAt: '2026-08-21T10:00:00Z',
      status: 'Complete',
      confidence: 79,
      groundingStatus: 'Source Conflict',
      humanReviewRequired: true,
      recommendations: [{ type: 'Applicability', value: 'Applicable', confidence: 79 }],
      explainability: {
        recommendation: 'Applicable with timing ambiguity',
        reasoningFactors: ['ORGFACT-004', 'IBS testing'],
        sourceEvidence: ['SRCSEC-003', 'SRCSEC-004', 'SRCSEC-005'],
        limitations: ['Conflicting transitional vs immediate testing language — human interpretation required.'],
      },
      qualityGate: { result: 'Pass with Warnings', checks: [] },
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-003',
    },
    {
      id: 'AIA-CC-ING-001-V1',
      analysisType: 'Regulatory Change Extraction',
      entityType: 'Change Candidate',
      entityId: 'CC-ING-001',
      publicationId: null,
      sourceDocumentIds: [],
      sourceSectionIds: [],
      organisationProfileVersion: 'ORG-DEMO-04',
      modelId: 'MODEL-RI-2.1',
      analysisEngineId: 'AIENG-RI-001',
      promptConfigId: 'PROMPT-REG-CHANGE-03',
      generatedAt: '2026-10-05T14:00:00Z',
      status: 'Complete',
      confidence: 78,
      groundingStatus: 'Insufficient Source Evidence',
      humanReviewRequired: true,
      recommendations: [{ type: 'Candidate', value: 'Possibly Applicable', confidence: 78 }],
      qualityGate: {
        result: 'Fail',
        checks: [
          { code: 'CITATION_COVERAGE', label: 'Material claims have citations', pass: false, detail: '1 missing' },
          { code: 'UNSUPPORTED', label: 'No unsupported claims', pass: false, detail: '1 unsupported' },
        ],
      },
      aiGovernancePolicyId: 'AIGOV-POL-001',
      useCaseId: 'UC-RI-002',
    },
  ];

  state.aiClaims = [
    claim('CLAIM-CHG-001-01', 'AIA-CHG-001-V2', 'Interpretation', 'Enhanced customer-outcome monitoring is likely to require changes to existing MI controls.', 90, ['SRCSEC-001'], 'Fully Supported', 'Supported'),
    claim('CLAIM-CHG-001-02', 'AIA-CHG-001-V2', 'Affected Business Line', 'Retail Banking and Customer Service are likely affected.', 88, ['SRCSEC-001'], 'Fully Supported', 'Supported'),
    claim('CLAIM-CHG-001-03', 'AIA-CHG-001-V2', 'Interpretation', 'Customer cohort MI likely requires uplift to meet meaningful cohort reporting.', 85, ['SRCSEC-002'], 'Fully Supported', 'Supported'),
    claim('CLAIM-CHG-003-01', 'AIA-CHG-003-V1', 'Applicability', 'Applicability uncertain due to overlap with existing committee reporting.', 72, ['SRCSEC-001'], 'Partially Supported', 'Partial'),
    claim('CLAIM-CHG-013-01', 'AIA-CHG-013-V1', 'Applicability', 'Critical third-party rules may extend to payment service providers.', 64, [], 'Insufficient Source Evidence', 'Missing'),
    claim('CLAIM-CHG-010-01', 'AIA-CHG-010-V1', 'Regulatory Requirement', 'Impact tolerance testing should be performed without undue delay.', 75, ['SRCSEC-004'], 'Source Conflict', 'Conflicting'),
    claim('CLAIM-CHG-010-02', 'AIA-CHG-010-V1', 'Key Date', 'Transitional arrangements may apply until March 2027.', 70, ['SRCSEC-005'], 'Source Conflict', 'Conflicting'),
    claim('CLAIM-CAND-001-01', 'AIA-CC-ING-001-V1', 'Regulatory Requirement', 'Incident communications protocols must be documented for retail customers.', 78, [], 'Unsupported Claim Detected', 'Missing', 'High'),
  ];

  analyses.forEach((a) => {
    a.claimIds = state.aiClaims.filter((c) => c.analysisId === a.id).map((c) => c.id);
    if (!a.qualityGate?.checks?.length) a.qualityGate = { result: a.qualityGate?.result || 'Pass', checks: [] };
  });

  return analyses;
}

function buildReviews() {
  return [
    {
      id: 'AIR-CHG-001-01',
      analysisId: 'AIA-CHG-001-V2',
      reviewerId: 'u-jones',
      startedAt: '2026-10-08T14:00:00Z',
      completedAt: '2026-10-08T14:30:00Z',
      decision: 'Accepted',
      justification: 'Retail lending and savings products are in scope; proceed with impact assessment.',
      originalRecommendation: 'Applicable',
      originalConfidence: 91,
      modifiedRecommendation: 'Applicable',
      reasonCategory: 'Additional business context',
      governanceApprovalRequired: true,
    },
    {
      id: 'AIR-CHG-003-01',
      analysisId: 'AIA-CHG-003-V1',
      reviewerId: 'u-smith',
      startedAt: '2026-10-09T09:00:00Z',
      completedAt: '2026-10-09T10:15:00Z',
      decision: 'Modified',
      justification: 'Committee papers already include outcome MI — applicability confirmed with narrower governance scope.',
      originalRecommendation: 'Review Required',
      originalConfidence: 74,
      modifiedRecommendation: 'Applicable',
      reasonCategory: 'Legal interpretation',
      governanceApprovalRequired: false,
    },
    {
      id: 'AIR-CHG-010-01',
      analysisId: 'AIA-CHG-010-V1',
      reviewerId: 'u-walker',
      startedAt: '2026-08-22T11:00:00Z',
      completedAt: '2026-08-22T12:00:00Z',
      decision: 'Modified',
      justification: 'Follow transitional timing in SS4/26 — full testing by effective date.',
      originalRecommendation: 'Applicable',
      originalConfidence: 79,
      modifiedRecommendation: 'Applicable',
      reasonCategory: 'Regulatory clarification',
      claimDecisions: [{ claimId: 'CLAIM-CHG-010-01', decision: 'Modified', comment: 'Defer immediate interpretation' }],
    },
  ];
}

function enrichSourceSections(state) {
  const extra = [
    {
      id: 'SRCSEC-004',
      documentId: 'DOC-PRA-SS4-26-V1',
      publicationId: 'PUB-003',
      heading: '4.2 Immediate testing expectation (mock)',
      sectionNumber: '4.2-immediate',
      citation: 'PRA SS4/26 §4.2 (immediate)',
      citationSlug: '4.2-immediate',
      text: 'DEMO: Firms should undertake impact tolerance testing as soon as practicable following publication.',
      pageMock: 8,
      order: 2,
    },
    {
      id: 'SRCSEC-005',
      documentId: 'DOC-PRA-SS4-26-V1',
      publicationId: 'PUB-003',
      heading: '4.3 Transitional arrangements (mock)',
      sectionNumber: '4.3-transitional',
      citation: 'PRA SS4/26 §4.3',
      citationSlug: '4.3-transitional',
      text: 'DEMO: Transitional arrangements may apply until the effective date of 31 March 2027.',
      pageMock: 9,
      order: 3,
    },
  ];
  state.sourceSections = [...(state.sourceSections || []), ...extra];
}

function linkEntities(state) {
  const map = {
    'CHG-001': 'AIA-CHG-001-V2',
    'CHG-003': 'AIA-CHG-003-V1',
    'CHG-013': 'AIA-CHG-013-V1',
    'CHG-010': 'AIA-CHG-010-V1',
    'PUB-001': 'AIA-PUB-001-V1',
  };
  Object.entries(map).forEach(([eid, aid]) => {
    const ch = state.changes.find((c) => c.id === eid);
    if (ch) {
      ch.currentAnalysisId = aid;
      ch.primaryAnalysisId = aid;
    }
    const pub = state.publications.find((p) => p.id === eid);
    if (pub) pub.currentAnalysisId = aid;
  });
  const cand = state.changeCandidates?.find((c) => c.id === 'CC-ING-001');
  if (cand) {
    cand.generatingAnalysisId = 'AIA-CC-ING-001-V1';
    cand.modelId = 'MODEL-RI-2.1';
    cand.promptConfigId = 'PROMPT-REG-CHANGE-03';
    cand.groundingStatus = 'Insufficient Source Evidence';
  }

  const ch1 = state.changes.find((c) => c.id === 'CHG-001');
  const a2 = state.aiAnalyses.find((a) => a.id === 'AIA-CHG-001-V2');
  if (ch1 && a2) {
    ch1.applicabilityConfidence = a2.confidence;
    ch1.applicabilityRecommendation = 'Applicable';
  }
  state.changes.forEach((ch) => {
    if (!ch.currentAnalysisId) return;
    const a = state.aiAnalyses.find((x) => x.id === ch.currentAnalysisId);
    if (!a) return;
    ch.aiGovernance = {
      ...(ch.aiGovernance || {}),
      analysisId: a.id,
      modelVersion: a.modelId,
      orgProfileVersion: a.organisationProfileVersion,
      generatedAt: a.generatedAt,
      humanReviewStatus: ch.aiGovernance?.humanReviewStatus || getReviewLabel(state, a.id),
    };
  });
}

function getReviewLabel(state, analysisId) {
  const r = state.aiReviews.find((x) => x.analysisId === analysisId);
  if (r?.decision === 'Modified') return 'Human modified';
  if (r?.decision === 'Accepted') return 'Human accepted';
  return 'Review required';
}

function syncPublicationAnalysis(state) {
  if (!state.publicationAnalysis) state.publicationAnalysis = {};
  const pubA = state.aiAnalyses.find((a) => a.id === 'AIA-PUB-001-V1');
  if (pubA && state.publicationAnalysis['PUB-001']) {
    state.publicationAnalysis['PUB-001'].analysisId = pubA.id;
    state.publicationAnalysis['PUB-001'].aiConfidence = pubA.confidence;
    state.publicationAnalysis['PUB-001'].groundingStatus = pubA.groundingStatus;
  }
}
