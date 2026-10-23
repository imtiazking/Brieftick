#!/usr/bin/env node
/** Print raw SQL for a manifest step name (stdout). */
import { readFileSync } from 'node:fs';
import { STAGING_MIGRATION_STEPS } from './migration-manifest.mjs';

const name = process.argv[2];
const step = STAGING_MIGRATION_STEPS.find((s) => s.name === name);
if (!step) {
  console.error('Unknown step:', name);
  process.exit(1);
}
process.stdout.write(readFileSync(step.path, 'utf8'));
