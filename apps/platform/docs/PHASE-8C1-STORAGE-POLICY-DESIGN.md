# Phase 8C.1 — Storage bucket `regulatory-source-snapshots`

**Not created in Supabase yet.** Apply via dashboard or IaC after migration.

## Bucket configuration

| Setting | Value |
|---------|--------|
| Name | `regulatory-source-snapshots` |
| Public | **false** |
| File size limit | **2 MB** per object (matches `HTTP_LIMITS.maxResponseBytes`) |
| Allowed MIME | `text/html`, `application/json`, `text/plain` (FCA 8C.1); extend for `application/pdf` later |

## Object key layout (content-addressed)

```
{regulator_external_key}/{source_external_key}/{publication_id}/v{version_number}/{sha256_prefix}/{artifact}.{ext}
```

| Artifact | Extension | Example |
|----------|-----------|---------|
| Raw body | `.raw` or `.html` | `.../a1b2c3d4/raw.html` |
| Normalised HTML | `.norm.html` | `.../e5f6.../article.norm.html` |
| Normalised text | `.txt` | `.../9abc.../article.txt` |
| Sidecar metadata | `.meta.json` | `.../meta.json` (hashes of siblings) |

**Idempotency:** If object at path exists and `HEAD` content-length + custom metadata `sha256` match, skip upload.

## Access policies (RLS-style storage policies)

### `storage.objects` policies (draft)

1. **Service role INSERT**  
   - Role: `service_role`  
   - Operation: `INSERT`  
   - Bucket: `regulatory-source-snapshots`  
   - Check: `true` (ingestion worker only)

2. **Service role SELECT** (for verify/reconcile)  
   - Role: `service_role`  
   - Operation: `SELECT`

3. **Platform operator SELECT**  
   - Role: `authenticated`  
   - Operation: `SELECT`  
   - Using: `public.is_platform_operator()` AND `bucket_id = 'regulatory-source-snapshots'`

4. **Deny all other roles** — no policy for `anon`; no tenant `authenticated` read.

5. **No UPDATE/DELETE** for `authenticated`. Optional `service_role` DELETE for **orphan reconciler** only.

## Integrity verification

On upload:

- Compute SHA-256 locally.
- Set metadata: `x-snapshot-sha256`, `x-snapshot-version-id` (after DB commit, optional second metadata patch).

On read (operator audit):

- Stream object, re-hash, compare to Postgres row.

## Secrets

- Use `SUPABASE_SERVICE_ROLE_KEY` only in server-side ingestion worker / Vercel env (not in repo).
- Signed URLs for operator download: short TTL, server action checks `is_platform_operator()`.

## Licensing

- Sidecar `licence_notice`: e.g. `"FCA website content — retained for internal regulatory provenance only; © FCA."`
- Product UI: link to canonical URL; do not expose raw HTML to unauthenticated users.

## Immutability note

| Layer | 8C.1 |
|-------|------|
| Application | Insert-only snapshot rows; no delete API |
| Bucket versioning | Recommended on production |
| Object Lock | Enterprise compliance optional |
