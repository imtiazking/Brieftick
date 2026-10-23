import { getState } from '../store.js';
import { executeAiRequest, getAiExecution, assertTenantExecutionAccess } from '../ai-runtime/ai-orchestrator.js';

export const aiRuntime = {
  execute: (request) => executeAiRequest(getState(), request, null),
  getExecution: (id) => {
    const state = getState();
    const ex = getAiExecution(state, id);
    if (!ex || !assertTenantExecutionAccess(state, ex)) return null;
    return ex;
  },
};
