import { createHash } from 'node:crypto';

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * In-memory snapshot storage for tests and local dev without Supabase bucket.
 */
export function createMemorySnapshotStorage() {
  /** @type {Map<string, { body: Buffer, contentType: string, sha256: string }>} */
  const objects = new Map();

  return {
    kind: 'memory',
    async putObject({ key, body, contentType, sha256 }) {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const computed = sha256Buffer(bytes);
      if (sha256 && computed !== sha256) {
        throw new Error(`putObject sha256 mismatch for ${key}`);
      }
      const existing = objects.get(key);
      if (existing) {
        if (existing.sha256 !== computed || existing.body.length !== bytes.length) {
          throw new Error(`object exists with different content: ${key}`);
        }
        return { key, sha256: computed, skipped: true };
      }
      objects.set(key, { body: Buffer.from(bytes), contentType, sha256: computed });
      return { key, sha256: computed, skipped: false };
    },
    async headObject({ key }) {
      const o = objects.get(key);
      if (!o) return { exists: false };
      const computed = sha256Buffer(o.body);
      if (computed !== o.sha256) {
        throw new Error(`integrity failure on head: ${key}`);
      }
      return { exists: true, sha256: computed, byteLength: o.body.length, contentType: o.contentType };
    },
    async getObject({ key }) {
      const o = objects.get(key);
      if (!o) return null;
      const computed = sha256Buffer(o.body);
      if (computed !== o.sha256) {
        throw new Error(`integrity failure: ${key}`);
      }
      return { body: o.body, contentType: o.contentType, sha256: o.sha256 };
    },
    async listKeys({ prefix = '' }) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    _dump() {
      return objects;
    },
  };
}
