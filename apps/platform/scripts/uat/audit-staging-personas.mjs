#!/usr/bin/env node
/**
 * Records actual Users A/B/C capabilities from /api/ri-lab/session without claiming restricted-maker labels.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_STAGING_ORIGIN } from '../staging/staging-release-hosts.mjs';
import { PERSONAS, probePersonaSession, runAs } from './staging-user-sessions.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', 'persona-audit-2026-11-25');
mkdirSync(outDir, { recursive: true });

const rows = [];
for (const key of ['A', 'B', 'C']) {
  const preflight = await probePersonaSession(key);
  if (preflight.state !== 'VALID') {
    rows.push({ persona: key, preflight });
    continue;
  }
  await runAs(key, async ({ page, identity }) => {
    const session = await page.evaluate(async () => {
      const res = await fetch('/api/ri-lab/session', { credentials: 'same-origin', cache: 'no-store' });
      return res.json();
    });
    const p = PERSONAS[key];
    rows.push({
      persona: key,
      label: p.label,
      userId: identity.userId,
      role: identity.role,
      organisationId: identity.organisationId,
      writeCapabilities: session.writeCapabilities || {},
      personaCapabilities: p.requiredCapabilities,
      notes: [
        key === 'A' && session.writeCapabilities?.aiReview && session.writeCapabilities?.obligationReview
          ? 'User A is COMPLIANCE_MANAGER with reviewer and obligation-approval grants; not a restricted maker.'
          : null,
        key === 'B' ? 'User B is the dedicated REVIEWER for human finding review.' : null,
        key === 'C' ? 'User C carries obligationReview for checker workflows.' : null,
      ].filter(Boolean),
    });
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  origin: OFFICIAL_STAGING_ORIGIN,
  sodOfflineGate: 'RI-SOD acceptance-ri-obligation-reviewer-approval.mjs (in-memory, not live self-approval)',
  personas: rows,
};
writeFileSync(join(outDir, 'PERSONA-AUDIT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));