/**
 * Content fingerprinting — SHA-256 of normalised bytes/text.
 */
import { mockChecksum } from '../ingestion-helpers.js';

export const FINGERPRINT_ALGORITHM = 'SHA-256';

export async function sha256Hex(content) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export async function fingerprintContent(content) {
  const normalised = typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : content;
  const hash = await sha256Hex(normalised);
  return {
    algorithm: FINGERPRINT_ALGORITHM,
    hash,
    checksumMock: mockChecksum(hash),
    fingerprintedAt: new Date().toISOString(),
  };
}
