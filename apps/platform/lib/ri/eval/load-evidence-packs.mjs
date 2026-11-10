import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_PACKS_DIR } from './eval-paths.mjs';

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @returns {{ manifest: object|null, byPublicationId: Map<string, { html?: object[], pdf?: object[], packMeta: object }>, packHashes: Record<string,string> }}
 */
export function loadEvidencePackIndex() {
  const byPublicationId = new Map();
  const packHashes = {};
  const manifestPath = join(EVIDENCE_PACKS_DIR, 'manifest.json');
  let manifest = null;
  if (existsSync(manifestPath)) {
    const raw = readFileSync(manifestPath, 'utf8');
    packHashes.manifest = sha256Text(raw);
    manifest = JSON.parse(raw);
  }

  if (!existsSync(EVIDENCE_PACKS_DIR)) {
    return { manifest, byPublicationId, packHashes };
  }

  for (const name of readdirSync(EVIDENCE_PACKS_DIR)) {
    if (!name.endsWith('.json') || name === 'manifest.json') continue;
    const path = join(EVIDENCE_PACKS_DIR, name);
    const raw = readFileSync(path, 'utf8');
    packHashes[name] = sha256Text(raw);
    const pack = JSON.parse(raw);
    const pubId = pack.publicationId;
    if (!pubId) continue;
    const entry = byPublicationId.get(pubId) || { packMeta: [] };
    if (pack.profile === 'html_article_v2' && pack.askRiEvidence) {
      entry.html = Array.isArray(pack.askRiEvidence) ? pack.askRiEvidence : [pack.askRiEvidence];
    }
    if (pack.profile === 'pdf_primary_v1' && pack.askRiEvidence) {
      entry.pdf = Array.isArray(pack.askRiEvidence) ? pack.askRiEvidence : [pack.askRiEvidence];
    }
    entry.packMeta.push({
      packFile: name,
      profile: pack.profile,
      extractionRevisionId: pack.extractionRevisionId,
      contentSha256: pack.contentSha256,
      exportSource: pack.exportSource,
    });
    byPublicationId.set(pubId, entry);
  }
  return { manifest, byPublicationId, packHashes };
}

/**
 * Hydrate Ask RI state slices from frozen packs (read-only).
 * When simulateCatalogueAttach is false, caller must not pre-load catalogue evidence (publication gate).
 */
export function hydrateStateFromPacks(caseRow, packIndex, tenantState, { simulateCatalogueAttach }) {
  const state = {
    publicationHtmlEvidence: [],
    publicationPdfEvidence: [],
    publicationHtmlEvidenceErrors: [],
    publicationPdfEvidenceErrors: [],
    ...(caseRow.tenantDataRequired ? tenantState : {}),
  };

  if (!simulateCatalogueAttach) {
    return state;
  }

  const ids = caseRow.expectedPublicationIds || [];
  for (const pubId of ids) {
    const entry = packIndex.byPublicationId.get(pubId);
    if (!entry) continue;
    if (entry.html?.length) state.publicationHtmlEvidence.push(...entry.html);
    if (entry.pdf?.length) state.publicationPdfEvidence.push(...entry.pdf);
  }
  return state;
}
