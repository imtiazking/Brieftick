import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/regulatory');

let cachedManifest = null;

export function loadFixtureManifestSync() {
  if (cachedManifest) return cachedManifest;
  cachedManifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'fixtures.json'), 'utf8'));
  return cachedManifest;
}

export function loadFixtureHtmlSync(fixtureFile) {
  return readFileSync(join(FIXTURE_ROOT, fixtureFile), 'utf8');
}
