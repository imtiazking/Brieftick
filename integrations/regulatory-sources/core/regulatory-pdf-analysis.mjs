/**
 * Deterministic regulatory analysis from structured PDF extraction (no generative inference).
 */

const PUBLICATION_CLASSES = [
  'consultation_paper',
  'policy_statement',
  'supervisory_statement',
  'guidance',
  'regulatory_rules',
  'other_regulatory_publication',
];

const DEVELOPMENT_KINDS = [
  'proposed_requirement',
  'new_requirement',
  'amended_requirement',
  'withdrawn_requirement',
  'regulatory_expectation',
  'consultation_question',
  'implementation_deadline',
];

/**
 * @param {object} input
 * @param {object} input.structured
 * @param {object} [input.publicationMetadata]
 * @param {string} [input.canonicalUrl]
 */
export function analyzeRegulatoryPdfDocument(input) {
  const structured = input.structured || {};
  const meta = input.publicationMetadata || {};
  const fullText = (structured.pages || []).map((p) => p.text).join('\n');
  const url = String(input.canonicalUrl || meta.canonicalUrl || '').toLowerCase();

  const publicationClassification = classifyPublication(meta, url, fullText);
  const regulatoryStatus = deriveRegulatoryStatus(publicationClassification, fullText, meta);
  const developments = extractDevelopments(fullText, regulatoryStatus);
  const applicability = inferApplicability(fullText, publicationClassification);

  return {
    analyzerVersion: 'regulatory-pdf-analysis-v1',
    publicationClassification,
    regulatoryStatus,
    developments,
    applicability,
    consultationPreserved:
      publicationClassification.primaryClass === 'consultation_paper' &&
      regulatoryStatus.bindingObligationsDetected === false &&
      regulatoryStatus.isFinalisedGuidance !== true,
    isFinalisedGuidance: regulatoryStatus.isFinalisedGuidance === true,
  };
}

function resolveFinalisedGuidance(meta, url, text) {
  const pubType = String(
    meta.publicationType || meta.publication_type || meta.publicationTypeLabel || '',
  ).toLowerCase();
  if (pubType.includes('finalised') || pubType.includes('finalized')) return true;
  if (/publication\/finalised-guidance\//i.test(url)) return true;
  if (/final\s+non-handbook guidance/i.test(text.slice(0, 12000))) return true;
  return false;
}

function classifyPublication(meta, url, text) {
  const label = String(meta.publicationTypeLabel || '').toLowerCase();
  const finalised = resolveFinalisedGuidance(meta, url, text);
  let primaryClass = 'other_regulatory_publication';
  if (finalised) {
    primaryClass = 'guidance';
  } else if (label.includes('consultation') || url.includes('consultation-papers') || /consultation paper/i.test(text)) {
    primaryClass = 'consultation_paper';
  } else if (/policy statement/i.test(text) || label.includes('policy statement')) {
    primaryClass = 'policy_statement';
  } else if (/supervisory statement/i.test(text)) {
    primaryClass = 'supervisory_statement';
  } else if (/guidance/i.test(text) && !/consultation/i.test(text)) {
    primaryClass = 'guidance';
  } else if (/rules|instrument/i.test(text)) {
    primaryClass = 'regulatory_rules';
  }
  return {
    primaryClass,
    allowedClasses: PUBLICATION_CLASSES,
    label: meta.publicationTypeLabel || null,
  };
}

function deriveRegulatoryStatus(publicationClassification, text, meta = {}) {
  const isFinalisedGuidance = resolveFinalisedGuidance(meta, '', text);
  const isConsultation =
    publicationClassification.primaryClass === 'consultation_paper' && !isFinalisedGuidance;
  const proposes =
    !isFinalisedGuidance && /\b(propose|proposing|we propose|consultation)\b/i.test(text);
  const bindingLanguage = /\b(must|shall|required to|is required)\b/i.test(text) && !isConsultation;
  return {
    phase: isConsultation ? 'consultation' : proposes ? 'proposed' : 'published_or_informational',
    proposedChanges: isConsultation || proposes,
    publishedFinalRules: !isConsultation && publicationClassification.primaryClass === 'regulatory_rules',
    existingBindingObligationsMentioned: bindingLanguage,
    nonBindingGuidance: publicationClassification.primaryClass === 'guidance',
    informationalContent: !isConsultation && !bindingLanguage,
    bindingObligationsDetected: bindingLanguage && !isConsultation,
    mustNotTreatProposalsAsBinding: isConsultation,
    isFinalisedGuidance,
  };
}

function extractDevelopments(text, regulatoryStatus) {
  const developments = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/^\d+\.\s/.test(line) && /(question|views|respond)/i.test(line)) {
      developments.push({
        kind: 'consultation_question',
        regulatoryStatus: 'proposed',
        summary: line.slice(0, 500),
        supportedBySource: true,
      });
    }
    if (/\b(we propose|firm(s)? should|firms are expected)\b/i.test(line)) {
      developments.push({
        kind: regulatoryStatus.proposedChanges ? 'proposed_requirement' : 'regulatory_expectation',
        regulatoryStatus: regulatoryStatus.proposedChanges ? 'proposed' : 'guidance_or_expectation',
        summary: line.slice(0, 500),
        supportedBySource: true,
      });
    }
    if (/\b(comes into force|effective from|implementation date|by \d{1,2} .+ \d{4})\b/i.test(line)) {
      developments.push({
        kind: 'implementation_deadline',
        regulatoryStatus: regulatoryStatus.proposedChanges ? 'proposed' : 'published_or_informational',
        summary: line.slice(0, 500),
        supportedBySource: true,
      });
    }
  }

  const seen = new Set();
  return developments.filter((d) => {
    const k = d.summary.slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return DEVELOPMENT_KINDS.includes(d.kind);
  });
}

function inferApplicability(text, publicationClassification) {
  const lower = text.toLowerCase();
  const functions = [];
  if (/financial crime|aml|ctf|fraud/.test(lower)) functions.push('financial_crime_compliance');
  if (/customer due diligence|cdd|kyc/.test(lower)) functions.push('customer_due_diligence');
  if (/governance|senior management/.test(lower)) functions.push('governance');
  if (/systems and controls/.test(lower)) functions.push('compliance_controls');

  return {
    potentiallyAffectedOrganisations: lower.includes('firm') ? ['authorised_financial_services_firms'] : [],
    businessFunctions: functions,
    productsAndServices: [],
    complianceFrameworks: lower.includes('financial crime guide') ? ['FCA Financial Crime Guide'] : [],
    operationalProcesses: functions,
    universalApplicability: false,
    requiresFirmSpecificAssessment: true,
  };
}
