/**
 * Production normalised regulatory document (ingestion contract).
 * @typedef {Object} NormalisedRegulatoryDocument
 * @property {string} regulatorId REG-*
 * @property {string} sourceId SRC-*
 * @property {string|null} externalDocumentId
 * @property {string} title
 * @property {string} publicationType
 * @property {string} canonicalUrl
 * @property {string|null} publicationDate ISO date or null
 * @property {string|null} [effectiveDate]
 * @property {string|null} [consultationDeadline]
 * @property {string|null} [summary]
 * @property {string} contentHash
 * @property {string} retrievedAt ISO timestamp
 * @property {string} dataOrigin
 * @property {Record<string, unknown>} provenance
 * @property {string[]} [contentClasses]
 */

export const INGESTION_DATA_ORIGIN = 'regulated-ingestion';
export const INGESTION_PROVENANCE_ORIGIN = 'FORGENIQ_RI_INGESTION';
