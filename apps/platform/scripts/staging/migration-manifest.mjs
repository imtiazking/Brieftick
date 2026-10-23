/**
 * Canonical staging migration order (repo files + lifecycle split).
 * Names must match apply_migration `name` for skip detection via Management API.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dir, '..', '..', 'supabase', 'migrations');

export const STAGING_MIGRATION_STEPS = [
  { name: '20260322140000_platform_identity', path: join(migrationsDir, '20260322140000_platform_identity.sql') },
  { name: '20260322150000_ri_reference', path: join(migrationsDir, '20260322150000_ri_reference.sql') },
  // Full lifecycle split (replaces monolithic file for partial-retry safety)
  { name: '20260322150100_ri_lifecycle_core', path: join(__dir, '_lifecycle_part1.sql') },
  { name: '20260322150100_ri_lifecycle_rest', path: join(__dir, '_lifecycle_part2.sql') },
  { name: '20260322150200_ri_rls', path: join(migrationsDir, '20260322150200_ri_rls.sql') },
  { name: '20260323160000_ri_ingestion', path: join(migrationsDir, '20260323160000_ri_ingestion.sql') },
  { name: '20260324170000_ri_ingestion_operations', path: join(migrationsDir, '20260324170000_ri_ingestion_operations.sql') },
  { name: '20260325120000_ri_ai', path: join(migrationsDir, '20260325120000_ri_ai.sql') },
  { name: '20260325130000_ri_ai_lineage', path: join(migrationsDir, '20260325130000_ri_ai_lineage.sql') },
  { name: '20260325140000_ri_ask_ri', path: join(migrationsDir, '20260325140000_ri_ask_ri.sql') },
];

/** Legacy MCP names that may exist without full DDL — do not treat as complete. */
export const LEGACY_PLACEHOLDER_NAMES = new Set([
  '20260322150100_ri_lifecycle_part1',
]);

export function assertManifestFilesExist() {
  for (const step of STAGING_MIGRATION_STEPS) {
    if (!existsSync(step.path)) {
      throw new Error(`Missing migration file for ${step.name}: ${step.path}`);
    }
  }
}
