/**
 * Offline regulatory catalogue for explicit reference resolution (indexed corpus scope).
 */

import { createHash } from 'node:crypto';
import { inferPublicationReferenceFromEvidence } from '../ask-ri/publication-pdf-question-match.mjs';

const REF_FROM_TITLE_RE =
  /\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*[/:]\s*(\d{1,2})\b/i;

export function normalizeFcaRef(kind, major, minor) {
  const k = String(kind || '').toUpperCase();
  return `${k}${major}/${minor}`;
}

function refsFromPack(pack) {
  const refs = new Set();
  const title = String(pack.publicationTitle || '');
  const url = String(pack.canonicalUrl || '');
  const ext = pack.askRiEvidence?.publicationMetadata?.externalDocumentId || pack.externalDocumentId;
  if (ext) {
    const m = String(ext).match(/\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/i);
    if (m) refs.add(normalizeFcaRef(m[1], m[2], m[3]));
  }
  const fromTitle = title.match(/\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/i);
  if (fromTitle) refs.add(normalizeFcaRef(fromTitle[1], fromTitle[2], fromTitle[3]));
  const fromUrl = url.match(/\/(cp|ps|fg|dp|tr)(\d{1,3})-(\d{1,2})\b/i);
  if (fromUrl) refs.add(normalizeFcaRef(fromUrl[1], fromUrl[2], fromUrl[3]));
  const slashInUrl = url.match(/\b(cp|ps|fg|dp|tr)(\d{1,3})\/(\d{1,2})\b/i);
  if (slashInUrl) refs.add(normalizeFcaRef(slashInUrl[1], slashInUrl[2], slashInUrl[3]));

  const inferred = inferPublicationReferenceFromEvidence({
    publicationTitle: title,
    canonicalUrl: url,
    publicationReference: pack.publicationReference,
  });
  if (inferred && /\b(CP|PS|FG|DP|TR)/i.test(inferred)) {
    const m = inferred.match(/\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/i);
    if (m) refs.add(normalizeFcaRef(m[1], m[2], m[3]));
  }

  const titleMatch = title.match(REF_FROM_TITLE_RE);
  if (titleMatch) refs.add(normalizeFcaRef(titleMatch[1], titleMatch[2], titleMatch[3]));

  return [...refs];
}

function aliasTitles(pack) {
  const aliases = new Set();
  const title = String(pack.publicationTitle || '').trim();
  if (title) aliases.add(title.toLowerCase());
  const short = title.match(REF_FROM_TITLE_RE);
  if (short) aliases.add(normalizeFcaRef(short[1], short[2], short[3]).toLowerCase());
  for (const alias of pack.catalogueAliases || []) {
    if (alias) aliases.add(String(alias).trim().toLowerCase());
  }
  return [...aliases];
}

/**
 * @param {Array<{ pack: object, packFile?: string }>} packRows
 */
export function buildRegulatoryCatalogueFromPacks(packRows) {
  const byPublicationId = new Map();
  const byRef = new Map();
  const byTitle = new Map();
  const byUuid = new Map();

  for (const row of packRows) {
    const pack = row.pack || row;
    const publicationId = pack.publicationId;
    if (!publicationId) continue;
    const entry = {
      publicationId,
      publicationTitle: pack.publicationTitle,
      canonicalUrl: pack.canonicalUrl,
      regulator: pack.regulator || 'FCA',
      regulatoryStatus: pack.regulatoryStatus || pack.publicationType,
      extractionRevisionId: pack.extractionRevisionId,
      extractionProfile: pack.extractionProfile || pack.profile,
      contentSha256: pack.contentSha256,
      references: refsFromPack(pack),
      aliases: aliasTitles(pack),
      packFile: row.packFile || null,
    };
    byPublicationId.set(publicationId, entry);
    byUuid.set(publicationId.toLowerCase(), entry);
    for (const ref of entry.references) byRef.set(ref.toUpperCase(), entry);
    for (const alias of entry.aliases) byTitle.set(alias, entry);
  }

  return {
    catalogueVersion: 1,
    scope: 'offline_indexed_corpus_only',
    entries: [...byPublicationId.values()],
    byPublicationId,
    byRef,
    byTitle,
    byUuid,
    digest: createHash('sha256')
      .update([...byPublicationId.keys()].sort().join('|'))
      .digest('hex')
      .slice(0, 16),
  };
}
