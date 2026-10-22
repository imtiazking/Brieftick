import type { PlatformRole } from '@/lib/roles';
import { roleAtLeast } from '@/lib/roles';

export type RiAction =
  | 'ri:read'
  | 'triage:read'
  | 'triage:write'
  | 'applicability:read'
  | 'applicability:write'
  | 'change:read'
  | 'change:write'
  | 'impact:read'
  | 'impact:write'
  | 'impact:submit'
  | 'impact:review'
  | 'impact:approve'
  | 'obligation:read'
  | 'obligation:write'
  | 'obligation:review'
  | 'policy:read'
  | 'policy:write'
  | 'risk:read'
  | 'risk:write'
  | 'control:read'
  | 'control:write'
  | 'action:read'
  | 'action:write'
  | 'evidence:read'
  | 'evidence:write'
  | 'finding:read'
  | 'finding:write'
  | 'finding:close'
  | 'assurance:read'
  | 'assurance:write';

const MATRIX: Record<RiAction, PlatformRole> = {
  'ri:read': 'VIEWER',
  'triage:read': 'VIEWER',
  'triage:write': 'ANALYST',
  'applicability:read': 'VIEWER',
  'applicability:write': 'ANALYST',
  'change:read': 'VIEWER',
  'change:write': 'ANALYST',
  'impact:read': 'VIEWER',
  'impact:write': 'ANALYST',
  'impact:submit': 'ANALYST',
  'impact:review': 'REVIEWER',
  'impact:approve': 'COMPLIANCE_MANAGER',
  'obligation:read': 'VIEWER',
  'obligation:write': 'ANALYST',
  'obligation:review': 'REVIEWER',
  'policy:read': 'VIEWER',
  'policy:write': 'ANALYST',
  'risk:read': 'VIEWER',
  'risk:write': 'ANALYST',
  'control:read': 'VIEWER',
  'control:write': 'ANALYST',
  'action:read': 'VIEWER',
  'action:write': 'ANALYST',
  'evidence:read': 'VIEWER',
  'evidence:write': 'ANALYST',
  'finding:read': 'VIEWER',
  'finding:write': 'ANALYST',
  'finding:close': 'COMPLIANCE_MANAGER',
  'assurance:read': 'VIEWER',
  'assurance:write': 'COMPLIANCE_MANAGER',
};

export function canRi(role: PlatformRole | null | undefined, action: RiAction): boolean {
  if (!role) return false;
  const minimum = MATRIX[action];
  return roleAtLeast(role, minimum);
}

export function assertCanRi(role: PlatformRole | null | undefined, action: RiAction): void {
  if (!canRi(role, action)) {
    throw new Error('insufficient_role');
  }
}
