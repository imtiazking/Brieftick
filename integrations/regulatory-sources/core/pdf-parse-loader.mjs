import { createRequire } from 'node:module';
import { join } from 'node:path';
import { dirnameFromImportMeta } from './esm-dirname.mjs';

const packageRoot = join(dirnameFromImportMeta(), '..');
const requireFromPackage = createRequire(join(packageRoot, 'package.json'));

/**
 * Resolve pdf-parse from @forgeniq/regulatory-sources package boundary (not platform hoisting).
 */
export function loadPdfParseModule() {
  try {
    const mod = requireFromPackage('pdf-parse');
    return mod.default || mod;
  } catch {
    try {
      const platformRequire = createRequire(join(process.cwd(), 'package.json'));
      const mod = platformRequire('pdf-parse');
      return mod.default || mod;
    } catch (e) {
      const err = new Error('pdf_parse_module_unavailable');
      err.cause = e;
      throw err;
    }
  }
}
