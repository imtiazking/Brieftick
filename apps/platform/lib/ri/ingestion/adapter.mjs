import { getConnectorForSource } from './connector-registry.mjs';
import { INGESTION_DATA_ORIGIN, INGESTION_PROVENANCE_ORIGIN } from './types.mjs';
import { SOURCE_COVERAGE_BY_ID } from '../../../../../packages/reference-data/catalogue/source-coverage.mjs';
import { resolveConnectorItemLimit } from '../../../../../integrations/regulatory-sources/core/contract.mjs';
import { finalizeOnlyUrlDocuments } from './only-url.mjs';

/**
 * Map integration connector output → production normalised documents.
 * @param {string} sourceId
 * @param {{ fixture?: { publications: object[] }, liveAllowed?: boolean, maxItems?: number, onlyUrl?: string }} options
 */
export async function retrieveNormalisedDocuments(sourceId, options = {}) {
  if (options.fixture?.publications?.length) {
    const mapped = options.fixture.publications.map((p) => mapFixtureDoc(sourceId, p));
    return finalizeOnlyUrlDocuments(options.onlyUrl, mapped);
  }

  const connector = getConnectorForSource(sourceId);
  if (!connector) {
    throw new Error(`no_connector_for_${sourceId}`);
  }

  const itemLimit = resolveConnectorItemLimit(
    { maxItems: connector.maxItems, pilotMaxItems: connector.pilotMaxItems ?? null },
    options,
  );

  const result = await connector.verify({
    liveAllowed: options.liveAllowed === true,
    maxItems: itemLimit,
    onlyCanonicalUrl: options.onlyUrl || undefined,
  });

  const coverage = SOURCE_COVERAGE_BY_ID[sourceId];
  const contentClasses = coverage?.contentClasses ?? [];

  if (options.onlyUrl) {
    const err = result.summary?.error;
    if (err && (result.publications || []).length === 0) {
      throw new Error(err);
    }
  }

  const sliceLimit = options.onlyUrl ? 1 : itemLimit;
  const mapped = (result.publications || []).slice(0, sliceLimit).map((pub) => ({
    regulatorId: pub.regulatorId,
    sourceId: pub.sourceId,
    externalDocumentId: pub.externalId ?? null,
    title: pub.title,
    publicationType: pub.publicationType,
    canonicalUrl: pub.canonicalUrl,
    publicationDate: pub.publicationDate ?? null,
    effectiveDate: pub.effectiveDate ?? null,
    consultationDeadline: null,
    summary: pub.summary ?? null,
    contentHash: pub.contentHash,
    retrievedAt: pub.retrievedAt ?? new Date().toISOString(),
    dataOrigin: INGESTION_DATA_ORIGIN,
    contentClasses,
    provenance: {
      origin: INGESTION_PROVENANCE_ORIGIN,
      connectorId: connector.connectorId,
      retrievalMethod: connector.retrievalMethod,
      integrationSummaryStatus: result.summary?.verificationStatus ?? null,
      sourcePublishedAt: pub.sourcePublishedAt ?? null,
      ...(pub.publicationTypeInference ? { publicationTypeInference: pub.publicationTypeInference } : {}),
    },
    evidenceCapture: pub.evidenceCapture ?? null,
    contentType: pub.evidenceCapture?.contentType ?? pub.contentType ?? null,
  }));

  return finalizeOnlyUrlDocuments(options.onlyUrl, mapped);
}

function mapFixtureDoc(sourceId, partial) {
  const coverage = SOURCE_COVERAGE_BY_ID[sourceId];
  return {
    regulatorId: partial.regulatorId,
    sourceId: partial.sourceId || sourceId,
    externalDocumentId: partial.externalDocumentId ?? partial.externalId ?? null,
    title: partial.title,
    publicationType: partial.publicationType || 'publication',
    canonicalUrl: partial.canonicalUrl,
    publicationDate: partial.publicationDate ?? null,
    effectiveDate: partial.effectiveDate ?? null,
    consultationDeadline: partial.consultationDeadline ?? null,
    summary: partial.summary ?? null,
    contentHash: partial.contentHash,
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    dataOrigin: INGESTION_DATA_ORIGIN,
    contentClasses: partial.contentClasses ?? coverage?.contentClasses ?? [],
    provenance: {
      origin: INGESTION_PROVENANCE_ORIGIN,
      fixture: true,
      ...(partial.provenance || {}),
    },
    evidenceCapture: partial.evidenceCapture ?? null,
    contentType: partial.evidenceCapture?.contentType ?? partial.contentType ?? null,
  };
}
