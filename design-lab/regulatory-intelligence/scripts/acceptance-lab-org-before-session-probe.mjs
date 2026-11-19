#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '..', 'js', 'platform', 'lab-connectivity.js'), 'utf8');
const bootstrapIdx = src.indexOf('export async function bootstrapLabConnectivity');
const nextExport = src.indexOf('export async function disconnectConnectedBackend', bootstrapIdx);
const slice = src.slice(bootstrapIdx, nextExport > bootstrapIdx ? nextExport : bootstrapIdx + 4000);
const tenantGate = slice.indexOf('ensureSupabaseOrganisationActive');
const probeCall = slice.indexOf('probeClerkLabSession');
if (tenantGate < 0 || probeCall < 0 || tenantGate > probeCall) {
  console.error('FAIL: bootstrapLabConnectivity must call ensureSupabaseOrganisationActive before probeClerkLabSession');
  process.exit(1);
}
console.log('PASS: lab-connectivity resolves tenant before session probe');