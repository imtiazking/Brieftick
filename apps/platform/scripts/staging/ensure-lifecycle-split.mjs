#!/usr/bin/env node
/**
 * Generate _lifecycle_part1.sql and _lifecycle_part2.sql from the monolithic migration
 * (idempotent; safe to re-run). Used before staging:apply-migrations on a fresh clone.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const monolith = join(__dir, '..', '..', 'supabase', 'migrations', '20260322150100_ri_lifecycle.sql');
const part1 = join(__dir, '_lifecycle_part1.sql');
const part2 = join(__dir, '_lifecycle_part2.sql');

const MARKER = 'create table public.action_impact_assessment_links';
const sql = readFileSync(monolith, 'utf8');
const idx = sql.indexOf(MARKER);
if (idx < 0) {
  throw new Error(`Split marker not found in ${monolith}`);
}
const head = sql.slice(0, idx).trimEnd() + '\n';
const tail = sql.slice(idx).trimStart();

if (!existsSync(part1) || readFileSync(part1, 'utf8') !== head) {
  writeFileSync(part1, head);
  console.log('Wrote', part1);
}
if (!existsSync(part2) || readFileSync(part2, 'utf8') !== tail) {
  writeFileSync(part2, tail);
  console.log('Wrote', part2);
}
