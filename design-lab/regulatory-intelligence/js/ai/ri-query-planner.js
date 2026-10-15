/**
 * Ask RI query planner — validates structured plans from natural language (Route B).
 */
import { buildAskQueryPlan } from './ri-graph-plan.js';

export function planAskRiQuery(question, state) {
  const plan = buildAskQueryPlan(question, state);
  if (!plan?.query) return { ok: false, error: 'empty question' };
  return { ok: true, plan };
}

export { buildAskQueryPlan };
