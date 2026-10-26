#!/usr/bin/env node
import assert from 'node:assert/strict';
import { getPublicationSummaryVerificationNotice } from '../lib/ri/publication-source-verification.ts';

const withDrift = {
  metadataCorrections: [
    {
      versionKind: 'metadata_correction_with_source_hash_drift',
      summaryMatchesIngestSourceHash: false,
      ingestSourceHash: 'aa1d884a',
      liveContentFingerprint: 'ae358fe5',
      liveContentRetrievedAt: '2026-10-26T17:00:00.000Z',
    },
  ],
};

assert.ok(getPublicationSummaryVerificationNotice(withDrift)?.message.includes('Source verification notice'));
assert.equal(
  getPublicationSummaryVerificationNotice(withDrift)?.summaryRetrievedAt,
  '2026-10-26T17:00:00.000Z',
);
assert.equal(getPublicationSummaryVerificationNotice({ metadataCorrections: [] }), null);
assert.equal(getPublicationSummaryVerificationNotice({}), null);

console.log('acceptance-publication-source-verification: PASS');
