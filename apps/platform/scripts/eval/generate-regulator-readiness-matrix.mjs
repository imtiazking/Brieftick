#!/usr/bin/env node
/**
 * Regulator / source readiness matrix (implementation status; activation requires independent approval).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const regulatorsPath = join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulators.mjs');
const sourcesPath = join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulatory-sources.mjs');
const draftsPath = join(repoRoot, 'docs', 'eval', 'REG-CLASSIFICATION-POLICY-DRAFTS-UNVERIFIED.json');
const outPath = join(repoRoot, 'docs', 'eval', 'REGULATOR-READINESS-MATRIX-2026-11-23.json');

const PRIORITY = new Set(['REG-FCA', 'REG-PRA', 'REG-ICO', 'REG-FRC', 'REG-PSR-UK']);

function loadDraftKeys() {
  try {
    const raw = JSON.parse(readFileSync(draftsPath, 'utf8'));
    return new Set((raw.policies || []).map((p) => p.regulatorKey || p.regulatorId).filter(Boolean));
  } catch {
    return new Set();
  }
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

const regText = readFileSync(regulatorsPath, 'utf8');
const srcText = readFileSync(sourcesPath, 'utf8');
const regulatorCount = countMatches(regText, /regulatorId:\s*'([^']+)'/g);
const sourceCount = countMatches(srcText, /source\('([^']+)'/g);
const draftKeys = loadDraftKeys();

const regulators = [...regText.matchAll(/regulatorId:\s*'([^']+)'/g)].map((m) => m[1]);
const sources = [...srcText.matchAll(/source\('([^']+)'/g)].map((m) => m[1]);

const matrix = {
  capturedAt: new Date().toISOString(),
  totals: { regulators: regulatorCount, sources: sourceCount },
  priorityRegulators: [...PRIORITY].map((id) => ({
    regulatorId: id,
    policyDraft: draftKeys.has(id) || (id === 'REG-PSR-UK' && draftKeys.has('REG-PSR')),
    verified: id === 'REG-FCA',
    approved: id === 'REG-FCA',
    activated: id === 'REG-FCA',
    testedConversion: id === 'REG-FCA',
    notes:
      id === 'REG-FRC'
        ? 'Unverified conversion policy — suspension pending OP1/OP2'
        : PRIORITY.has(id) && id !== 'REG-FCA'
          ? 'Authoritative research draft only; fail-closed on staging'
          : undefined,
  })),
  regulators: regulators.map((id) => ({
    regulatorId: id,
    policyDraft: draftKeys.has(id),
    verified: id === 'REG-FCA',
    approved: id === 'REG-FCA',
    activated: id === 'REG-FCA',
  })),
  sources: sources.map((id) => ({
    sourceId: id,
    catalogueSeeded: true,
    connectorEnabled: false,
  })),
};

writeFileSync(outPath, JSON.stringify(matrix, null, 2));
console.log(`Wrote ${outPath} (${regulatorCount} regulators, ${sourceCount} sources)`);