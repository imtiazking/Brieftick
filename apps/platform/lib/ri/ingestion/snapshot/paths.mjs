/**
 * Content-addressed storage keys (bucket-relative).
 * Upload-first safe: does not require publication/version UUIDs.
 * @param {string} sha256
 * @param {string} ext
 */
export function buildContentAddressedKey(sha256, ext) {
  const prefix = String(sha256).slice(0, 16);
  return `by-hash/${prefix}/${sha256}.${ext}`;
}

/**
 * @deprecated Use buildContentAddressedKey for upload-first; retained for future per-publication layout.
 */
export function buildSnapshotObjectKey(p) {
  const prefix = String(p.sha256).slice(0, 16);
  const safeReg = p.regulatorKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSrc = p.sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeReg}/${safeSrc}/${p.publicationId}/v${p.versionNumber}/${prefix}/${p.artifact}.${p.ext}`;
}
