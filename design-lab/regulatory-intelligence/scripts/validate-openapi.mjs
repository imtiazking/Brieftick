/**
 * Lightweight OpenAPI structure check (no external validator).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'architecture', 'api', 'openapi.yaml');
const yaml = readFileSync(path, 'utf8');

const paths = [...yaml.matchAll(/^\s{2}(\/[^\s:]+):/gm)].map((m) => m[1]);
const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);

if (!yaml.includes('openapi:')) throw new Error('missing openapi version');
if (!yaml.includes('ApiError')) throw new Error('missing ApiError schema');
if (dupes.length) throw new Error(`duplicate paths: ${dupes.join(', ')}`);
if (!paths.some((p) => p.includes('/publications'))) throw new Error('missing publications routes');
if (!paths.some((p) => p.includes('/changes'))) throw new Error('missing changes routes');

if (!yaml.includes('/v1') && !yaml.includes('version: 1.0.0')) throw new Error('missing API versioning');
console.log(`OPENAPI OK — ${paths.length} paths (server base /v1)`);
