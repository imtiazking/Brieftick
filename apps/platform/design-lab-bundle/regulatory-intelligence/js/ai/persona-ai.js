import { permissionsForRoles } from '../platform/platform-permissions.js';

export function canGenerateAiSummary(state) {
  const user = state.people?.find((p) => p.id === state.currentDemoUserId);
  const perms = permissionsForRoles(user?.applicationRoleIds || []);
  return perms.includes('ai.execution.create') || perms.includes('ai.review');
}

export function canMutateAiReviewState(state, userId = state.currentDemoUserId) {
  const user = state.people?.find((p) => p.id === userId);
  const perms = permissionsForRoles(user?.applicationRoleIds || []);
  return perms.includes('ai.review');
}

export function isAuditorReadOnly(state, userId = state.currentDemoUserId) {
  const user = state.people?.find((p) => p.id === userId);
  const roles = user?.applicationRoleIds || [];
  return roles.includes('AR-AUDIT-VIEWER') && !roles.includes('AR-REG-ANALYST');
}

export function canCreateAiWorkflowDrafts(state, userId = state.currentDemoUserId) {
  if (isAuditorReadOnly(state, userId)) return false;
  return canGenerateAiSummary(state);
}

/** Analyst, Compliance Manager, and Auditor (read) may use Ask RI / comparisons / summaries. */
export function canAskRi(state, userId = state.currentDemoUserId) {
  const user = state.people?.find((p) => p.id === userId);
  const perms = permissionsForRoles(user?.applicationRoleIds || []);
  if (perms.includes('ai.execution.create') || perms.includes('ai.review')) return true;
  return isAuditorReadOnly(state, userId);
}

export function canApproveExecutiveSummary(state, userId = state.currentDemoUserId) {
  if (isAuditorReadOnly(state, userId)) return false;
  return canMutateAiReviewState(state, userId);
}
