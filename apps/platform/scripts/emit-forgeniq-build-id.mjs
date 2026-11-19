#!/usr/bin/env node
/**
 * Writes apps/platform/.forgeniq-build-id for Next.js build-time FORGENIQ_BUILD_ID.
 * Prefers explicit env, then Vercel git metadata, then local git rev-parse at monorepo root.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformDir, '..', '..');
const outFile = join(platformDir, '.forgeniq-build-id');

function resolveSha() {
  const explicit =
    process.env.FORGENIQ_SOURCE_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (explicit) return explicit;
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Vercel CLI uploads have no .git: keep the id emitted on the deploying machine.
    if (existsSync(outFile)) {
      const existing = readFileSync(outFile, 'utf8').trim();
      if (/^[0-9a-f]{7,40}$/.test(existing)) return existing;
    }
    return 'unknown';
  }
}

const sha = resolveSha();
writeFileSync(outFile, `${sha}\n`, 'utf8');
console.log(`FORGENIQ build id: ${sha}`);