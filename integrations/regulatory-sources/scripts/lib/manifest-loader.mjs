import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_DIR = join(__dir, '..', '..', 'manifests');

const MANIFEST_FILES = ['batch-1-verification.json', 'batch-1b-verification.json'];

export function loadAllManifestEntries(repoRoot = join(__dir, '..', '..', '..', '..')) {
  const bySourceId = new Map();
  for (const file of MANIFEST_FILES) {
    const path = join(repoRoot, 'integrations', 'regulatory-sources', 'manifests', file);
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const entry of manifest.entries) {
      bySourceId.set(entry.sourceId, { ...entry, manifestFile: file });
    }
  }
  return bySourceId;
}

export function resolveManifestRef(repoRoot, ref) {
  const [filePart, sourceId] = ref.split('#');
  if (!filePart || !sourceId) return null;
  const path = join(repoRoot, filePart);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const entry = manifest.entries.find((e) => e.sourceId === sourceId);
  return entry ? { manifest, entry, path: filePart } : null;
}
