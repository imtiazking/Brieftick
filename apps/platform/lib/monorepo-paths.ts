import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function platformLibDirFromImportMeta(metaUrl: string | URL = import.meta.url): string {
  const href = typeof metaUrl === 'string' ? metaUrl : metaUrl.href;
  return path.dirname(fileURLToPath(href));
}

const LAB_REL = path.join('design-lab', 'regulatory-intelligence');
const LAB_INDEX = path.join(LAB_REL, 'index.html');

function labIndexExists(root: string): boolean {
  return existsSync(path.join(root, LAB_INDEX));
}

/** Monorepo root — must resolve in dev, `next build`, and Vercel (bundled route handlers). */
export function getMonorepoRoot(): string {
  const envRoot = process.env.FORGENIQ_MONOREPO_ROOT?.trim();
  if (envRoot && labIndexExists(envRoot)) return path.resolve(envRoot);

  const fromLib = path.resolve(platformLibDirFromImportMeta(), '..', '..', '..');
  if (labIndexExists(fromLib)) return fromLib;

  const fromCwd = path.resolve(process.cwd(), '..', '..');
  if (labIndexExists(fromCwd)) return fromCwd;

  const fromPlatformCwd = path.resolve(process.cwd(), '..', '..', '..');
  if (labIndexExists(fromPlatformCwd)) return fromPlatformCwd;

  return fromLib;
}

export function getDesignLabRegulatoryIntelligenceRoot(): string {
  const bundled = path.join(process.cwd(), 'design-lab-bundle', 'regulatory-intelligence');
  if (existsSync(path.join(bundled, 'index.html'))) return bundled;
  return path.join(getMonorepoRoot(), 'design-lab', 'regulatory-intelligence');
}

export function getSplitThemeStylesheetPath(): string {
  const bundledTheme = path.join(process.cwd(), 'design-lab-bundle', 'styles', 'split-theme.css');
  if (existsSync(bundledTheme)) return bundledTheme;
  return path.join(getMonorepoRoot(), 'styles', 'split-theme.css');
}
