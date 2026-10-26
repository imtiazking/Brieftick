/**
 * Supabase Storage adapter for regulatory source snapshots.
 * Does not create buckets — bucket must exist before use (staging provisioning step).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service-role client
 * @param {{ bucket: string }} options
 */
export function createSupabaseSnapshotStorage(supabase, options) {
  const bucket = options.bucket || 'regulatory-source-snapshots';

  return {
    kind: 'supabase',
    bucket,
    async putObject({ key, body, contentType, sha256 }) {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const head = await this.headObject({ key });
      if (head.exists) {
        if (sha256 && head.sha256 !== sha256) {
          throw new Error(`object exists with different hash: ${key}`);
        }
        return { key, sha256: head.sha256, skipped: true };
      }
      const { error } = await supabase.storage.from(bucket).upload(key, bytes, {
        contentType,
        upsert: false,
      });
      if (error) {
        if (error.message?.includes('already exists') || error.statusCode === '409') {
          const verify = await this.headObject({ key });
          if (verify.exists && (!sha256 || verify.sha256 === sha256)) {
            return { key, sha256: verify.sha256, skipped: true };
          }
        }
        throw new Error(`supabase upload failed: ${error.message}`);
      }
      const verify = await this.headObject({ key });
      if (!verify.exists) throw new Error(`upload verify failed: ${key}`);
      if (sha256 && verify.sha256 !== sha256) {
        throw new Error(`upload hash mismatch: ${key}`);
      }
      return { key, sha256: verify.sha256, skipped: false };
    },
    async headObject({ key }) {
      const { data, error } = await supabase.storage.from(bucket).download(key);
      if (error || !data) return { exists: false };
      const buf = Buffer.from(await data.arrayBuffer());
      const { createHash } = await import('node:crypto');
      const computed = createHash('sha256').update(buf).digest('hex');
      return {
        exists: true,
        sha256: computed,
        byteLength: buf.length,
        contentType: data.type || null,
      };
    },
    async getObject({ key }) {
      const { data, error } = await supabase.storage.from(bucket).download(key);
      if (error || !data) return null;
      const body = Buffer.from(await data.arrayBuffer());
      const { createHash } = await import('node:crypto');
      const sha256 = createHash('sha256').update(body).digest('hex');
      return { body, contentType: data.type || null, sha256 };
    },
    async listKeys({ prefix = '' }) {
      const keys = [];
      const walk = async (folder) => {
        const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
        if (error || !data) return;
        for (const item of data) {
          const path = folder ? `${folder}/${item.name}` : item.name;
          if (item.id) keys.push(path);
          else await walk(path);
        }
      };
      await walk(prefix.replace(/\/$/, ''));
      return keys.filter((k) => k.startsWith(prefix));
    },
  };
}
