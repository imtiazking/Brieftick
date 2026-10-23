import { canonicalJsonString } from './canonical-json.js';
import { sha256Hex } from '../connectors/fingerprint.js';

export function buildContextHashPayload({ taskType, records, promptVersion, outputSchemaVersion }) {
  const orderedRecords = [...records]
    .map((r) => ({
      recordId: r.recordId,
      recordCategory: r.recordCategory,
      recordType: r.recordType,
      recordVersion: r.recordVersion || r.contentHash || 'v0',
      contentHash: r.contentHash || null,
      sourceContent: r.sourceContent || '',
    }))
    .sort((a, b) => a.recordId.localeCompare(b.recordId));

  return { taskType, promptVersion, outputSchemaVersion, records: orderedRecords };
}

export async function computeContextHash(payload) {
  return sha256Hex(canonicalJsonString(payload));
}

export async function computeContextHashFromParts(parts) {
  return computeContextHash(buildContextHashPayload(parts));
}
