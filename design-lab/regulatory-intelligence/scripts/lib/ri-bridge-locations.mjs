import { join } from 'path';
import { homedir } from 'os';

/** Inspected: package.json `serve -l 3000 .` */
export const LOCAL_RI_DEV_ORIGIN = 'http://localhost:3000';
export const LOCAL_RI_DEV_PORT = 3000;
export const LOCAL_AI_BRIDGE_ORIGIN = 'http://127.0.0.1:3765';
export const DEFAULT_RI_AI_BRIDGE_PORT = 3765;

export function defaultBridgeHome() {
  const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return join(base, 'forgeniq-ri', 'ri-ai-bridge');
}

export function resolveBridgeRoot() {
  return process.env.RI_AI_BRIDGE_HOME || defaultBridgeHome();
}

export function resolveRepoRoot(fromDir) {
  if (process.env.FORGENIQ_REPO_ROOT) return process.env.FORGENIQ_REPO_ROOT;
  return join(fromDir, '..', '..', '..');
}

/** Legacy repo-relative URLs that must NOT serve bridge source after relocation */
export const STATIC_BRIDGE_PROBE_PATHS = [
  '/tools/ri-ai-bridge/server-prompt.js',
  '/tools/ri-ai-bridge/origin-policy.js',
  '/tools/ri-ai-bridge/cache-path-policy.js',
  '/design-lab/regulatory-intelligence/server/ai-bridge/server-prompt.js',
];
