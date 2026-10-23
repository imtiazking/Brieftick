#!/usr/bin/env node
/**
 * Apply reference-catalogue.generated.sql to remote Supabase (idempotent upserts).
 * Requires SUPABASE_ACCESS_TOKEN. Do not paste tokens into chat.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..', '..');
const seedPath = join(platformRoot, 'supabase', 'seed', 'reference-catalogue.generated.sql');
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'lhgzdicffkhaaykzthep';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(seedPath)) {
  console.error('Run npm run sync:reference-catalogue first.');
  process.exit(1);
}
if (!token && !dryRun) {
  console.error('Set SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const raw = readFileSync(seedPath, 'utf8');
const inner = raw
  .replace(/^--.*\n/gm, '')
  .replace(/^begin;\s*/i, '')
  .replace(/\s*commit;\s*$/i, '')
  .trim();
const statements = inner
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body;
}

async function main() {
  console.log(`Applying ${statements.length} catalogue statements to ${projectRef}...`);
  if (dryRun) {
    console.log('Dry run — no changes.');
    return;
  }
  for (let i = 0; i < statements.length; i++) {
    const sql = `${statements[i]};`;
    await runQuery(sql);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${statements.length}`);
  }
  const check = await runQuery('select count(*)::int as regulators from public.regulators');
  console.log('Done.', check);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
