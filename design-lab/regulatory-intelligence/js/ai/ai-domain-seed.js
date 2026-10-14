import { ALL_PROMPT_METADATA_V16 } from './prompt-metadata.js';

export function applyAiDomainSeed(state, saved = {}) {
  state.riAiAnalysisResults = saved.riAiAnalysisResults || state.riAiAnalysisResults || [];
  state.aiDomainAuditEvents = saved.aiDomainAuditEvents || state.aiDomainAuditEvents || [];
  state.riAiWorkflowTraces = saved.riAiWorkflowTraces || state.riAiWorkflowTraces || [];
  state.aiPromptCatalog = saved.aiPromptCatalog || ALL_PROMPT_METADATA_V16;
  state.aiRetentionPolicy = saved.aiRetentionPolicy || {
    maxAnalyses: 50,
    maxSerializedBytesPerAnalysis: 40960,
    maxTotalBytes: 2621440,
  };
  return state;
}
