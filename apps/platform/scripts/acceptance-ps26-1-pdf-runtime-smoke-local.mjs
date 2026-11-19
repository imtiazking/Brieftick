#!/usr/bin/env node
/**
 * Local read-only PS26 PDF runtime smoke (no HTTP, no DB, no Anthropic).
 */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const { runPdfRuntimeSmokeCore } = await import(
  pathToFileURL(join(platformDir, 'lib/ri/diagnostics/pdf-runtime-smoke-core.mjs')).href
);

process.env.RI_AI_EXECUTION_ENABLED = process.env.RI_AI_EXECUTION_ENABLED || '0';

const result = await runPdfRuntimeSmokeCore();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);