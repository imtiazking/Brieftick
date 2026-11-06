import { SCHEMA_VERSION } from '../migrate.js';

const VALID_ADAPTERS = new Set(['local', 'api']);
const VALID_AI_MODES = new Set(['fixture', 'live-verification', 'production']);

export function validatePlatformConfig(config = {}) {
  const issues = [];
  if (config.adapter && !VALID_ADAPTERS.has(config.adapter)) {
    issues.push(`Unknown adapter: ${config.adapter}`);
  }
  if (config.aiExecutionMode && !VALID_AI_MODES.has(config.aiExecutionMode)) {
    issues.push(`Unknown AI execution mode: ${config.aiExecutionMode}`);
  }
  if (config.schemaVersion != null && config.schemaVersion > SCHEMA_VERSION) {
    issues.push(`Unsupported schema version: ${config.schemaVersion}`);
  }
  return { ok: issues.length === 0, issues };
}

export function validateMinimalState(state) {
  const issues = [];
  if (!state) issues.push('State is null');
  if (!state?.publications?.length) issues.push('Missing publications baseline');
  if (!state?.platformConfig) issues.push('Missing platformConfig');
  const cfg = validatePlatformConfig(state?.platformConfig || {});
  issues.push(...cfg.issues);
  return { ok: issues.length === 0, issues };
}
