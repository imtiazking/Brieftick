import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
      './apps/platform/certs/supabase-root-2021-ca.pem',
      './integrations/regulatory-sources/certs/mc-gov-sa-trust-chain.pem',
    ],
    '/api/ri-lab/dashboard': [
      './integrations/regulatory-sources/certs/mc-gov-sa-trust-chain.pem',
    ],
  },
  env: {
    FORGENIQ_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local-dev',
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
