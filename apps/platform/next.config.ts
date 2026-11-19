import type { NextConfig } from 'next';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const platformDir = path.dirname(fileURLToPath(import.meta.url));

/** Globs in outputFileTracingIncludes resolve with cwd = apps/platform (not outputFileTracingRoot). */
const PS26_PDF_RUNTIME_TRACE = [
  '../../integrations/regulatory-sources/core/**/*.mjs',
  '../../integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf',
  './lib/ri/ingestion/snapshot/ps26-official-pdf-source.mjs',
  './lib/ri/ingestion/snapshot/create-primary-pdf-extraction-revision.mjs',
  './lib/ri/ingestion/snapshot/persist-extraction-revision.mjs',
  './lib/ri/ingestion/snapshot/upload-primary-pdf-extraction.mjs',
  './lib/ri/ingestion/snapshot/extraction-revision-rules.mjs',
  './lib/ri/ingestion/snapshot/extraction-revision-types.mjs',
  './lib/ri/eval/eval-paths.mjs',
  './lib/ri/diagnostics/pdf-runtime-smoke-core.mjs',
];

function resolveForgeniqBuildId(): string {
  const fromEnv =
    process.env.FORGENIQ_SOURCE_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  const idFile = path.join(platformDir, '.forgeniq-build-id');
  if (existsSync(idFile)) {
    const sha = readFileSync(idFile, 'utf8').trim();
    if (sha && sha !== 'unknown') return sha;
  }
  return 'local-dev';
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/design-lab/regulatory-intelligence/route': [
      './design-lab-bundle/regulatory-intelligence/**',
      './design-lab-bundle/styles/**',
      './design-lab/regulatory-intelligence/**',
    ],
    '/design-lab/regulatory-intelligence/[[...path]]/route': [
      './design-lab-bundle/regulatory-intelligence/**',
      './design-lab-bundle/styles/**',
      './design-lab/regulatory-intelligence/**',
    ],
    '/design-lab/regulatory-intelligence/[[...path]]': [
      './design-lab-bundle/regulatory-intelligence/**',
      './design-lab-bundle/styles/**',
    ],
    '/api/internal/ri-ingestion/scheduler-tick': [
      './certs/supabase-root-2021-ca.pem',
      '../../integrations/regulatory-sources/certs/mc-gov-sa-trust-chain.pem',
    ],
    '/api/ri-lab/dashboard': [
      '../../integrations/regulatory-sources/certs/mc-gov-sa-trust-chain.pem',
    ],
    '/api/ri-lab/ai-analysis-runs': PS26_PDF_RUNTIME_TRACE,
    '/api/ri-lab/ai-analysis-runs/route': PS26_PDF_RUNTIME_TRACE,
    '/api/internal/ri-diagnostics/pdf-runtime-smoke': PS26_PDF_RUNTIME_TRACE,
    '/api/internal/ri-diagnostics/pdf-runtime-smoke/route': PS26_PDF_RUNTIME_TRACE,
  },
  env: {
    FORGENIQ_BUILD_ID: resolveForgeniqBuildId(),
  },
  async redirects() {
    return [
      {
        source: '/design-lab/regulatory-intelligence',
        destination: '/design-lab/regulatory-intelligence/index.html',
        permanent: false,
      },
      {
        source: '/design-lab/regulatory-intelligence/',
        destination: '/design-lab/regulatory-intelligence/index.html',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/styles/split-theme.css',
        destination: '/api/ri-lab/root-asset/split-theme-css',
      },
    ];
  },
};

export default nextConfig;