#!/usr/bin/env node
/**
 * Apply a SQL file to DATABASE_URL (staging operator machine only).
 * Usage: node scripts/staging/apply-sql-file.psql.mjs path/to.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const file = process.argv[2];
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!file || !url) {
  console.error('Needs DATABASE_URL or SUPABASE_DB_URL and a migration file path');
  process.exit(1);
}
const sql = readFileSync(resolve(file), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('OK: applied', file);
} finally {
  await client.end();
}