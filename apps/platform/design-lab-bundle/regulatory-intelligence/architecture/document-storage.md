# Document & object storage

Binary content must not live in PostgreSQL or browser localStorage in production.

## Stored in object storage

- Regulator source PDFs/HTML archives
- Evidence uploads
- Assurance / board pack artefacts (when exported)

## Database holds

Metadata, checksum, retention class, tenant_id, storage_key, uploader, review status.

## Security controls

- Tenant-scoped keys
- Encryption at rest
- Signed / time-limited download URLs
- MIME validation, size limits, malware scanning (quarantine)
- Immutable source versions where required

## Versioning

Aligns with existing ingestion: fingerprint, previous version, checksum, catalogue linkage.
