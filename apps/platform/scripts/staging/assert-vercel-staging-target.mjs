#!/usr/bin/env node
/**
 * Hard guard: refuse Vercel deploy CLI unless target is the authorised staging project.
 * Does not call Vercel; inspects env + argv only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALLOWED_PROJECT = 'forgeniq-platform-staging';
const ALLOWED_PROJECT_ID = 'prj_y9O1A1zGFXe3GvJITnLL9mJUqve7';
const ALLOWED_SCOPE = 'imis-projects-8e15dca0';
const FORBIDDEN_PROJECTS = new Set(['platform', 'brieftick', 'www', 'forgeniq']);

const argv = process.argv.slice(2);
const args = [...argv, process.env.VERCEL_PROJECT_NAME, process.env.VERCEL_PROJECT_ID].filter(Boolean);

for (const token of args) {
  const low = String(token).toLowerCase();
  if (FORBIDDEN_PROJECTS.has(low)) {
    console.error(`BLOCKED: forbidden Vercel project name "${token}". Authorised staging only: ${ALLOWED_PROJECT}.`);
    process.exit(2);
  }
}

const linked = [
  join(process.cwd(), '.vercel', 'project.json'),
  resolve(process.cwd(), '..', '..', '.vercel', 'project.json'),
].find((p) => existsSync(p));

if (linked) {
  const { projectName, projectId } = JSON.parse(readFileSync(linked, 'utf8'));
  if (projectName !== ALLOWED_PROJECT || projectId !== ALLOWED_PROJECT_ID) {
    console.error(
      `BLOCKED: linked Vercel project ${projectName} (${projectId}) is not ${ALLOWED_PROJECT} (${ALLOWED_PROJECT_ID}).`,
    );
    console.error('Re-link from repo root: delete apps/platform/.vercel if present; use only docs/uat/VERCEL-DEPLOY-SAFETY.md.');
    process.exit(2);
  }
}

const projectFlag = argv.find((a, i) => argv[i - 1] === '--project' || a.startsWith('--project='));
const projectName = projectFlag?.includes('=') ? projectFlag.split('=')[1] : argv[argv.indexOf('--project') + 1];
if (projectName && projectName !== ALLOWED_PROJECT) {
  console.error(`BLOCKED: --project=${projectName}; use --project=${ALLOWED_PROJECT} only.`);
  process.exit(2);
}

if (process.env.VERCEL_ORG_ID && process.env.VERCEL_ORG_ID !== 'team_hhqI2hoyYXhIJachceL10BqK') {
  console.error(`BLOCKED: unexpected VERCEL_ORG_ID ${process.env.VERCEL_ORG_ID}`);
  process.exit(2);
}

console.log(
  JSON.stringify({ ok: true, allowedProject: ALLOWED_PROJECT, allowedProjectId: ALLOWED_PROJECT_ID, scope: ALLOWED_SCOPE }),
);