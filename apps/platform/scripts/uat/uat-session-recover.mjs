#!/usr/bin/env node
/**
 * Inventory saved Playwright profiles and validate sessions per authorised hostname.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverStoredProfiles,
  probeClerkOnHost,
  loadRegistry,
  KNOWN_ORIGINS,
} from './uat-session-registry.mjs';
import { ensureUatPersonas, probePersonaSession, loadUatAgentEnv } from './staging-user-sessions.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', `session-recovery-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(outDir, { recursive: true });

const clerkHosts = [];
for (const origin of KNOWN_ORIGINS) {
  clerkHosts.push({ origin, ...(await probeClerkOnHost(origin)) });
}

const stored = discoverStoredProfiles();
loadUatAgentEnv();
const validations = [];

for (const origin of KNOWN_ORIGINS) {
  const prev = process.env.FORGENIQ_AUTH_BASE;
  process.env.FORGENIQ_AUTH_BASE = origin;
  const ensured = await ensureUatPersonas(['A', 'B', 'C'], { label: `recover ${new URL(origin).hostname}`, allowProgrammatic: true });
  for (const row of ensured) {
    const hasProfile = stored.some((s) => s.hostname === new URL(origin).hostname && s.persona === row.persona);
    validations.push({ origin, hasProfile, ...row });
  }
  if (prev === undefined) delete process.env.FORGENIQ_AUTH_BASE;
  else process.env.FORGENIQ_AUTH_BASE = prev;
}

const report = {
  generatedAt: new Date().toISOString(),
  sessionRoot: discoverStoredProfiles.length ? stored[0].profilePath.split(/persona-/)[0] : null,
  registryEntries: Object.keys(loadRegistry().sessions || {}).length,
  storedProfiles: stored.map(({ hostname, persona, profilePath, layout }) => ({ hostname, persona, layout, profilePath })),
  clerkHostProbe: clerkHosts,
  validations,
  unattendedReady:
    validations.filter((v) => v.origin === KNOWN_ORIGINS[0]).every((v) => v.state === 'VALID') &&
    clerkHosts.find((h) => h.origin === KNOWN_ORIGINS[0])?.ok === true,
  candidateUnattendedReady:
    validations.filter((v) => v.origin === KNOWN_ORIGINS[1]).every((v) => v.state === 'VALID') &&
    clerkHosts.find((h) => h.origin === KNOWN_ORIGINS[1])?.ok === true,
};

writeFileSync(join(outDir, 'SESSION-RECOVERY.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const officialRows = validations.filter((v) => v.origin === KNOWN_ORIGINS[0]);
const candidateRows = validations.filter((v) => v.origin === KNOWN_ORIGINS[1]);
if (officialRows.some((v) => v.state !== 'VALID')) process.exit(2);
if (!report.unattendedReady) process.exit(2);
if (process.env.FORGENIQ_QA_REQUIRE_CANDIDATE === '1' && candidateRows.some((v) => v.state !== 'VALID')) process.exit(3);
if (!report.candidateUnattendedReady) process.exitCode = 0;