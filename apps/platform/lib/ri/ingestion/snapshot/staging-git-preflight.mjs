import { execSync } from 'node:child_process';

export const APPROVED_STAGING_BACKFILL_BRANCHES = ['production/ri-golden-master'];

/**
 * Resolve current git branch (never falls back to a silent "unknown" pass).
 */
export function resolveGitBranchForStagingPreflight() {
  const fromEnv = process.env.GIT_BRANCH?.trim();
  if (fromEnv === 'unknown') {
    return { branch: null, source: 'env', reason: 'literal_unknown' };
  }
  if (fromEnv) {
    return { branch: fromEnv, source: 'env' };
  }
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!branch || branch === 'HEAD') {
      return { branch: null, source: 'git', reason: 'detached_or_unresolved' };
    }
    return { branch, source: 'git' };
  } catch {
    return { branch: null, source: 'git', reason: 'git_unavailable' };
  }
}

/**
 * @param {{ branch: string | null, reason?: string }} resolved
 * @param {string[]} allowed
 */
export function assertResolvedStagingGitBranch(resolved, allowed) {
  if (!resolved?.branch) {
    throw new Error(`staging_git_branch_unknown:${resolved?.reason || 'missing'}`);
  }
  if (!allowed.includes(resolved.branch)) {
    throw new Error(`staging_git_branch_not_approved:${resolved.branch}`);
  }
  return resolved.branch;
}

/**
 * @param {string[]} [allowed]
 */
export function assertApprovedStagingGitBranch(allowed = APPROVED_STAGING_BACKFILL_BRANCHES) {
  return assertResolvedStagingGitBranch(resolveGitBranchForStagingPreflight(), allowed);
}
