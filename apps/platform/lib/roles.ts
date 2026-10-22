/**
 * Platform RBAC contract — extend with product permissions in later phases.
 */

export const PLATFORM_ROLES = [
  'OWNER',
  'ADMIN',
  'COMPLIANCE_MANAGER',
  'ANALYST',
  'REVIEWER',
  'VIEWER',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const ROLE_RANK: Record<PlatformRole, number> = {
  OWNER: 60,
  ADMIN: 50,
  COMPLIANCE_MANAGER: 40,
  ANALYST: 30,
  REVIEWER: 20,
  VIEWER: 10,
};

export function roleRank(role: PlatformRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function roleAtLeast(role: PlatformRole, minimum: PlatformRole): boolean {
  return roleRank(role) >= roleRank(minimum);
}

/** ADMIN cannot grant or assume OWNER without being the OWNER subject. */
export function canAssignRole(actor: PlatformRole, target: PlatformRole): boolean {
  if (target === 'OWNER') {
    return actor === 'OWNER';
  }
  return roleAtLeast(actor, 'ADMIN');
}

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}
