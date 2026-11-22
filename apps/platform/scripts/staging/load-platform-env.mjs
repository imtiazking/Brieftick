/**
 * Load apps/platform env the same way as Next.js (including .env.local).
 * Never logs secret values.
 */
import nextEnv from '@next/env';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} [fromMetaUrl] import.meta.url of caller under apps/platform/scripts */
export function resolvePlatformRoot(fromMetaUrl) {
  const dir = dirname(fileURLToPath(fromMetaUrl));
  if (dir.replace(/\\/g, '/').includes('/scripts/staging')) {
    return join(dir, '..', '..');
  }
  if (dir.replace(/\\/g, '/').endsWith('/scripts')) {
    return join(dir, '..');
  }
  return join(dir, '..', '..');
}

/** @param {string} platformRoot absolute path to apps/platform */
export function loadPlatformEnv(platformRoot) {
  nextEnv.loadEnvConfig(platformRoot, true);
}
