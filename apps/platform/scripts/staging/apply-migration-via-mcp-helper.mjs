#!/usr/bin/env node
/** Prints migration file path and SHA for manual MCP apply_migration (operator). */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: apply-migration-via-mcp-helper.mjs <migration.sql>');
  process.exit(1);
}
const sql = readFileSync(resolve(file), 'utf8');
const sha = createHash('sha256').update(sql).digest('hex');
console.log(JSON.stringify({ bytes: sql.length, sha256: sha, migrationName: file.replace(/.*[\\/]/, '').replace('.sql', '') }));