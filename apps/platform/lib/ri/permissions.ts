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
  | 'obligation:review';

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
