#!/usr/bin/env node
/**
 * DEPRECATED — Partner UAT must not be used for experimental PDF/AI testing.
 *
 * Use:
 *   node scripts/staging/fg22-obligation-pdf-technical-e2e.mjs
 *   node scripts/staging/read-only-verify-partner-fg22-preflight.mjs
 */
console.error(
  JSON.stringify({
    error: 'partner_uat_forbidden_for_experimental_ai',
    message:
      'This script previously wrote FG22 test rows into Partner UAT. Use fg22-obligation-pdf-technical-e2e.mjs instead.',
    audit: 'node scripts/staging/read-only-verify-partner-fg22-preflight.mjs',
  }),
);
process.exit(2);