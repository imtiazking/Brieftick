#!/usr/bin/env node
/**
 * Emit SQL for Supabase apply_migration (stdout). Operator pipes to MCP or Management API.
 * Usage: node scripts/staging/apply-migration-supabase-mcp.mjs supabase/migrations/FILE.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: apply-migration-supabase-mcp.mjs <migration.sql>');
  process.exit(1);
}
process.stdout.write(readFileSync(resolve(file), 'utf8'));