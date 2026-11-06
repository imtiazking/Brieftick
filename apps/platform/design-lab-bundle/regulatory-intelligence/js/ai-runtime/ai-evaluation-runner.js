import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAiRequest } from './ai-orchestrator.js';

const DATASET = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/ai-evaluation/golden-v1.json');

export function loadGoldenDataset() {
  return JSON.parse(readFileSync(DATASET, 'utf8'));
}

export async function runFixtureEvaluation(state, { modelId, configId }, addAudit = null) {
  const dataset = loadGoldenDataset();
  const results = [];
  for (const caseDef of dataset.cases) {
    if (!caseDef.entityId) {
      results.push({ id: caseDef.id, skipped: true });
      continue;
    }
    const r = await executeAiRequest(
      state,
      {
        useCaseId: caseDef.useCaseId,
        analysisType: 'Applicability Recommendation',
        targetEntityType: caseDef.entityType,
        targetEntityId: caseDef.entityId,
        sourceSectionIds: caseDef.sourceSectionIds,
        modelId: modelId || 'MODEL-RI-2.2',
        configId: configId || 'PROMPT-REG-CHANGE-04',
        fixtureScenario: caseDef.fixtureScenario || 'default',
        requestedBy: state.currentDemoUserId,
      },
      addAudit
    );
    results.push({ id: caseDef.id, ok: r.ok, qualityGate: r.qualityGate, code: r.code });
  }
  const pass = results.filter((x) => x.ok && !x.code).length;
  return {
    id: `AIEVAL-RUN-${Date.now()}`,
    modelId,
    configId,
    datasetVersion: dataset.version,
    runAt: new Date().toISOString(),
    metrics: {
      casesRun: results.length,
      passCount: pass,
      schemaSuccessRate: Math.round((pass / Math.max(1, results.length)) * 100),
    },
    results,
  };
}
