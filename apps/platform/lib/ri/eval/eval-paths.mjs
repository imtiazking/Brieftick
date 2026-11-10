import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const REPO_ROOT = join(platformRoot, '..', '..');
export const EVAL_SUITE_PATH = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v1.json');
export const EVIDENCE_PACKS_DIR = join(REPO_ROOT, 'docs', 'eval', 'evidence-packs');
export const BASELINE_DIR = join(REPO_ROOT, 'docs', 'eval', 'baseline');
