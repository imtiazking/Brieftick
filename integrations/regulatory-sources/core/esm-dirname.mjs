import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Webpack can pass a non-native URL object to import.meta.url; Node fileURLToPath expects string or native URL.
 */
export function filePathFromImportMeta(metaUrl = import.meta.url) {
  const href = typeof metaUrl === 'string' ? metaUrl : metaUrl.href;
  return fileURLToPath(href);
}

export function dirnameFromImportMeta(metaUrl = import.meta.url) {
  return dirname(filePathFromImportMeta(metaUrl));
}
