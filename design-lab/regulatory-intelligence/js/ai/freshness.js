import { AI_FRESHNESS } from './enums.js';
import { auditMarkedOutdated } from './audit.js';
import { buildContextHashPayload, computeContextHash } from './context-hash.js';

export async function recomputeContextHashForAnalysis(contextBundle) {
  const payload = buildContextHashPayload({
    taskType: contextBundle.taskType,
    records: contextBundle.records,
    promptVersion: contextBundle.promptMetadata.version,
    outputSchemaVersion: contextBundle.promptMetadata.outputSchemaVersion,
  });
  return computeContextHash(payload);
}

export async function markAnalysesOutdated(state, { taskType, selection, promptMetadata, actor }) {
  const { AiContextBuilder } = await import('./context-builder.js');
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({ taskType, selection });
  if (!ctx.ok) return { updated: 0 };
  const newHash = ctx.contextHash;
  let updated = 0;
  for (const a of state.riAiAnalysisResults || []) {
    if (a.contextHash && a.contextHash !== newHash && a.freshness === AI_FRESHNESS.CURRENT) {
      a.freshness = AI_FRESHNESS.OUTDATED;
      auditMarkedOutdated(state, {
        analysisId: a.analysisId,
        taskType: a.taskType,
        providerMode: a.providerMode,
        provider: a.provider,
        model: a.model,
        promptVersion: a.promptVersion,
        contextHash: a.contextHash,
        actor,
      });
      updated += 1;
    }
  }
  return { updated, newHash, oldHash: state.riAiAnalysisResults?.[0]?.contextHash };
}
