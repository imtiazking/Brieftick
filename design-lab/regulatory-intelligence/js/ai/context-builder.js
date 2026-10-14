import { CONTEXT_RECORD_CATEGORY } from './enums.js';

import { applyContextBounds } from './context-bounds.js';

import { buildContextHashPayload, computeContextHashFromParts } from './context-hash.js';

import { getPromptMetadataForTask } from './prompt-metadata.js';



const RI_RECORD_TYPES = new Set([

  'Publication',

  'Change',

  'ImpactAssessment',

  'Obligation',

  'Policy',

  'Risk',

  'Control',

  'Action',

  'Evidence',

  'Assurance',

  'Framework',

  'Sector',

  'Theme',

]);



function hashContent(text) {

  if (!text) return 'empty';

  let h = 0;

  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;

  return `h${Math.abs(h)}`;

}



function publicationRecord(state, id) {

  const p = state.publications?.find((x) => x.id === id);

  if (!p) return null;

  const text = [p.title, p.reference, p.summary, p.regulator, p.publishedDate, p.publicationDate, p.effectiveDate]
    .filter(Boolean)
    .join('\n');

  return {

    recordId: p.id,

    recordCategory: CONTEXT_RECORD_CATEGORY.RI_RECORD,

    recordType: 'Publication',

    recordTitle: p.title,

    internalRoute: `#/publications/${p.id}`,

    recordVersion: p.reference || 'v1',

    contentHash: hashContent(text),

    sourceContent: text,

  };

}



function assessmentRecord(state, id) {
  const a = state.assessments?.find((x) => x.id === id);
  if (!a) return null;
  const text = [a.title, a.aiSummary, a.status, a.materiality].filter(Boolean).join('\n');
  return {
    recordId: a.id,
    recordCategory: CONTEXT_RECORD_CATEGORY.RI_RECORD,
    recordType: 'ImpactAssessment',
    recordTitle: a.title,
    internalRoute: `#/assessment/${a.id}`,
    recordVersion: a.status || 'v1',
    contentHash: hashContent(text),
    sourceContent: text,
  };
}

function changeRecord(state, id) {

  const c = state.changes?.find((x) => x.id === id);

  if (!c) return null;

  const text = [c.title, c.summary, c.status, c.applicabilityDecision].filter(Boolean).join('\n');

  return {

    recordId: c.id,

    recordCategory: CONTEXT_RECORD_CATEGORY.RI_RECORD,

    recordType: 'Change',

    recordTitle: c.title,

    internalRoute: `#/changes/${c.id}`,

    recordVersion: c.status || 'v1',

    contentHash: hashContent(text),

    sourceContent: text,

  };

}



function officialSourceRecord(state, id) {

  const raw = state.rawSourceItems?.find((x) => x.id === id || x.rawId === id);

  if (!raw) return null;

  const text = [raw.title, raw.canonicalUrl, raw.publicationType, raw.regulator].filter(Boolean).join('\n');

  return {

    recordId: raw.id || raw.rawId,

    recordCategory: CONTEXT_RECORD_CATEGORY.OFFICIAL_SOURCE,

    recordType: 'OfficialSource',

    recordTitle: raw.title,

    canonicalUrl: raw.canonicalUrl,

    contentHash: raw.contentHash || hashContent(text),

    sourceContent: text,

  };

}



function resolveSelection(state, selection) {

  const records = [];

  for (const item of selection) {

    if (item.category === CONTEXT_RECORD_CATEGORY.OFFICIAL_SOURCE) {

      const r = officialSourceRecord(state, item.recordId);

      if (r) records.push(r);

    } else if (item.category === CONTEXT_RECORD_CATEGORY.RI_RECORD) {

      if (item.recordType === 'Publication') {

        const r = publicationRecord(state, item.recordId);

        if (r) records.push(r);

      } else if (item.recordType === 'Change') {

        const r = changeRecord(state, item.recordId);

        if (r) records.push(r);

      } else if (item.recordType === 'ImpactAssessment') {

        const r = assessmentRecord(state, item.recordId);

        if (r) records.push(r);

      }

    }

  }

  return records;

}



export class AiContextBuilder {

  constructor(state) {

    this.state = state;

  }



  async build({ taskType, selection }) {

    const promptMeta = getPromptMetadataForTask(taskType);

    if (!promptMeta) {

      return { ok: false, code: 'UNSUPPORTED_TASK', message: `Unsupported taskType ${taskType}` };

    }

    const rawRecords = resolveSelection(this.state, selection || []);

    if (!rawRecords.length) {

      return { ok: false, code: 'EMPTY_CONTEXT', message: 'No context records resolved' };

    }

    const bounded = applyContextBounds(rawRecords);

    const payload = buildContextHashPayload({

      taskType,

      records: bounded.records,

      promptVersion: promptMeta.version,

      outputSchemaVersion: promptMeta.outputSchemaVersion,

    });

    const contextHash = await computeContextHashFromParts({
      taskType,
      records: bounded.records,
      promptVersion: promptMeta.version,
      outputSchemaVersion: promptMeta.outputSchemaVersion,
    });

    return {

      ok: true,

      taskType,

      records: bounded.records,

      contextRecordIds: bounded.records.map((r) => r.recordId),

      contextHash,

      promptMetadata: promptMeta,

      truncated: bounded.truncated,

      totalChars: bounded.totalChars,

      canonicalPayload: payload,

    };

  }

}



export { RI_RECORD_TYPES };


