/**
 * Application roles & permissions (MOCK — not production RBAC).
 * Distinct from governance roles (Head of Regulatory Change, etc.).
 */

export const PERMISSIONS = [
  'publication.read',
  'change.read',
  'change.update',
  'change.approve',
  'assessment.submit',
  'assessment.approve',
  'evidence.create',
  'evidence.review',
  'governance.approve',
  'exception.approve',
  'ai.review',
  'ai.execution.create',
  'ai.execution.retry',
  'ai.reanalysis.request',
  'ai.provider.view',
  'ai.provider.manage',
  'ai.model.activate',
  'ai.evaluation.run',
  'ai.liveVerification.execute',
  'assurance.review',
  'finding.validate',
  'board.read',
  'admin.manage',
  'ingestion.run',
];

export const APPLICATION_ROLES = [
  { id: 'AR-PLATFORM-ADMIN', name: 'Platform Administrator', permissions: ['admin.manage', ...PERMISSIONS] },
  { id: 'AR-REG-ANALYST', name: 'Regulatory Analyst', permissions: ['publication.read', 'change.read', 'change.update', 'assessment.submit', 'evidence.create', 'ingestion.run', 'ai.review', 'ai.execution.create', 'ai.reanalysis.request', 'ai.provider.view', 'ai.evaluation.run'] },
  { id: 'AR-COMPLIANCE-REVIEWER', name: 'Compliance Reviewer', permissions: ['publication.read', 'change.read', 'assessment.approve', 'evidence.review', 'governance.approve', 'exception.approve', 'ai.review', 'ai.execution.create', 'assurance.review'] },
  { id: 'AR-RC-MANAGER', name: 'Regulatory Change Manager', permissions: ['publication.read', 'change.read', 'change.update', 'change.approve', 'assessment.submit', 'assessment.approve', 'governance.approve', 'board.read'] },
  { id: 'AR-BUSINESS-OWNER', name: 'Business Owner', permissions: ['publication.read', 'change.read', 'change.update', 'assessment.submit', 'evidence.create'] },
  { id: 'AR-ASSURANCE-REVIEWER', name: 'Assurance Reviewer', permissions: ['publication.read', 'change.read', 'assurance.review', 'finding.validate', 'board.read'] },
  { id: 'AR-EXEC-VIEWER', name: 'Executive Viewer', permissions: ['publication.read', 'change.read', 'board.read'] },
  { id: 'AR-AUDIT-VIEWER', name: 'Audit Viewer', permissions: ['publication.read', 'change.read', 'board.read'] },
];

export function permissionsForRoles(roleIds) {
  const set = new Set();
  (roleIds || []).forEach((rid) => {
    const role = APPLICATION_ROLES.find((r) => r.id === rid);
    role?.permissions?.forEach((p) => set.add(p));
  });
  return [...set];
}

/** MOCK AUTHORISATION — Design Lab simulation only. */
export function can(user, permission, _resource = null) {
  if (!user) return false;
  const perms = permissionsForRoles(user.applicationRoleIds || []);
  return perms.includes(permission);
}

export function assertPermission(state, permission, resource = null) {
  const user = state.people?.find((p) => p.id === state.currentDemoUserId);
  if (!can(user, permission, resource)) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: `You do not have permission to perform this action (${permission}). MOCK AUTHORISATION — not production secure.`,
    };
  }
  return { ok: true };
}
