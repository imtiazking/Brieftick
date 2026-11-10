import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const REPO_ROOT = join(platformRoot, '..', '..');
export const EVAL_SUITE_PATH = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v1.json');
export const EVIDENCE_PACKS_DIR = join(REPO_ROOT, 'docs', 'eval', 'evidence-packs');
export const SUPPLEMENTAL_CORPUS_2B2_DIR = join(REPO_ROOT, 'docs', 'eval', 'supplemental-corpus-2b2');
export const AUTHENTIC_CORPUS_B1_DIR = join(REPO_ROOT, 'docs', 'eval', 'authentic-corpus-b1-2b2');
export const AUTHENTIC_CORPUS_B2_DIR = join(REPO_ROOT, 'docs', 'eval', 'authentic-corpus-b2-2b2');
export const DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3 = join(
  REPO_ROOT,
  'docs',
  'eval',
  'development-retrieval-probes-2b2-step-b2-v3.json',
);
export const DEVELOPMENT_RETRIEVAL_ADJUDICATION_STEP_G = join(
  REPO_ROOT,
  'docs',
  'eval',
  'development-retrieval-adjudication-2b2-step-g-v1.json',
);
export const DEVELOPMENT_RETRIEVAL_PROBES_STEP_F = join(
  REPO_ROOT,
  'docs',
  'eval',
  'development-retrieval-probes-2b2-step-f-v1.json',
);
export const DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2 = join(
  REPO_ROOT,
  'docs',
  'eval',
  'development-retrieval-probes-2b2-step-f-v2.json',
);
export const BASELINE_DIR = join(REPO_ROOT, 'docs', 'eval', 'baseline');
export const EVAL_SUITE_V21_PATH = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
export const DETERMINISTIC_V21_R2_BASELINE = join(
  REPO_ROOT,
  'docs',
  'eval',
  'baseline',
  'deterministic-v2.1-r2-2026-11-10.json',
);
