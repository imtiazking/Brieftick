import {
  AI_ANALYSIS_STATUS,
  AI_REVIEW_STATUS,
  AI_FRESHNESS,
  AI_TASK_TYPE,
  AI_ANALYSIS_ERROR_CODES,
  CITATION_KIND,
  ACTIVE_TASK_TYPES_V17,
} from './enums.js';
import { validateWorkflowCrossReferences } from './workflow-output-validator.js';
import { validateIntelligenceOutput } from './intelligence-output-validator.js';
import { assertSafeOfficialUrl } from './url-safety.js';
import { excerptMeetsMinimum } from './excerpt-validation.js';
import { dateSupportedInContext } from './date-validation.js';

function contextTextForRecord(records, recordId) {
  const r = records.find((x) => x.recordId === recordId);
  return r?.sourceContent || '';
}

export class AiOutputValidator {
  constructor({ state, contextBundle }) {
    this.state = state;
    this.context = contextBundle;
    this.contextIds = new Set(contextBundle?.contextRecordIds || []);
    this.records = contextBundle?.records || [];
  }

  validateProviderOutput(taskType, output) {
    const errors = [];
    if (!ACTIVE_TASK_TYPES_V17.includes(taskType)) {
      errors.push(`Unsupported active taskType ${taskType}`);
    }
    if (!output || typeof output !== 'object') {
      return this.fail(AI_ANALYSIS_ERROR_CODES.PROVIDER_ERROR, errors.concat('Missing structured output'));
    }
    if (output.summary == null && taskType === AI_TASK_TYPE.AI_SUMMARY) {
      errors.push('summary required');
    }
    for (const date of output.keyDates || []) {
      const check = dateSupportedInContext(date, this.records.map((r) => r.sourceContent));
      if (check.unsupported) {
        return this.failValidation(AI_ANALYSIS_ERROR_CODES.UNSUPPORTED_DATE_CLAIM, `Unsupported date claim: ${date}`);
      }
    }
    for (const c of output.citations || []) {
      const citeErr = this.validateCitation(c);
      if (citeErr) errors.push(citeErr);
    }
    if (output.injectionCanaryEcho) {
      errors.push('AI-009 canary echoed in output');
    }
    for (const payload of [output.summary, ...(output.findings || []), ...(output.keyPoints || [])]) {
      if (typeof payload === 'string' && /<script|onerror=|javascript:/i.test(payload)) {
        errors.push('Unsafe HTML/script payload in text field');
      }
    }
    if (errors.length) {
      const code = errors.some((e) => e.includes('Unsupported date'))
        ? AI_ANALYSIS_ERROR_CODES.UNSUPPORTED_DATE_CLAIM
        : AI_ANALYSIS_ERROR_CODES.CONTEXT_HASH_MISMATCH;
      return this.failValidation(code, errors.join('; '));
    }
    const wf = validateWorkflowCrossReferences(this.state, taskType, output);
    if (!wf.ok) return wf;
    const intel = validateIntelligenceOutput(taskType, output, this.context);
    if (!intel.ok) return this.failValidation(AI_ANALYSIS_ERROR_CODES.CONTEXT_HASH_MISMATCH, intel.message);
    const needsUncertainty = ![
      AI_TASK_TYPE.AI_SUMMARY,
    ].includes(taskType);
    if (needsUncertainty && !(output.uncertainties || []).length) {
      return this.failValidation(AI_ANALYSIS_ERROR_CODES.PROVIDER_ERROR, 'uncertainties required');
    }
    if (taskType === AI_TASK_TYPE.AI_RI_QA && !output.answer) {
      return this.failValidation(AI_ANALYSIS_ERROR_CODES.PROVIDER_ERROR, 'answer required');
    }
    return { ok: true, output };
  }

  validateCitation(c) {
    if (!c?.citationKind) return 'citationKind required';
    if (c.citationKind === CITATION_KIND.OFFICIAL_SOURCE) {
      if (!this.contextIds.has(c.sourceRecordId)) return `unknown official source ${c.sourceRecordId}`;
      if (c.canonicalUrl) {
        const u = assertSafeOfficialUrl(c.canonicalUrl);
        if (!u.ok) return u.message;
      }
    } else if (c.citationKind === CITATION_KIND.RI_RECORD) {
      if (!this.contextIds.has(c.recordId)) return `unknown RI record ${c.recordId}`;
      if (c.canonicalUrl) return 'RI_RECORD must not use canonicalUrl';
      if (!c.internalRoute || !String(c.internalRoute).startsWith('#/')) {
        return 'RI_RECORD requires validated internalRoute';
      }
      if (!this.recordExists(c.recordId, c.recordType)) return `RI record missing ${c.recordId}`;
    } else {
      return `unknown citationKind ${c.citationKind}`;
    }
    const ctx = contextTextForRecord(this.records, c.sourceRecordId || c.recordId);
    const ex = excerptMeetsMinimum(c.excerpt, ctx, c.fieldReference);
    if (!ex.ok) return ex.message;
    return null;
  }

  recordExists(recordId, recordType) {
    if (recordType === 'Publication') {
      return (
        this.state.publications?.some((p) => p.id === recordId) ||
        this.state.baselPublicationRecords?.some((p) => p.id === recordId || p.baselRecordId === recordId)
      );
    }
    if (recordType === 'Change') return this.state.changes?.some((c) => c.id === recordId);
    if (recordType === 'ImpactAssessment') return this.state.assessments?.some((a) => a.id === recordId);
    if (recordType === 'Framework') return this.state.frameworks?.some((f) => f.id === recordId);
    if (recordType === 'Obligation') return this.state.obligations?.some((o) => o.id === recordId);
    return this.contextIds.has(recordId);
  }

  fail(code, message) {
    return {
      ok: false,
      status: AI_ANALYSIS_STATUS.FAILED,
      errorCode: code,
      errorMessage: message,
    };
  }

  failValidation(code, message) {
    return {
      ok: false,
      status: AI_ANALYSIS_STATUS.VALIDATION_FAILED,
      errorCode: code,
      errorMessage: message,
    };
  }
}

export function validateAnalysisRecord(analysis) {
  const errors = [];
  if (!Object.values(AI_ANALYSIS_STATUS).includes(analysis.status)) errors.push('invalid status');
  if (!Object.values(AI_REVIEW_STATUS).includes(analysis.reviewStatus)) errors.push('invalid reviewStatus');
  if (!Object.values(AI_FRESHNESS).includes(analysis.freshness)) errors.push('invalid freshness');
  return { ok: errors.length === 0, errors };
}
