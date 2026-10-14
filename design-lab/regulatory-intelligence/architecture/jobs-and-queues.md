# Jobs and queues

## Async work

- Regulator polling and document retrieval
- Parsing and normalisation
- AI analysis and re-analysis
- Large evidence processing
- Report / pack generation
- Notifications delivery
- Scheduled reviews and escalations

## Job model

`job_id`, `tenant_id`, `type`, `payload_ref`, `status`, `attempt`, `max_attempts`, `created`, `started`, `completed`, `error`, `correlation_id`, `idempotency_key`

Statuses: Queued · Running · Completed · Failed · Dead Letter

## Retries

Exponential backoff, retry limits, DLQ, operator recovery. Ingestion duplicate detection reuses existing version architecture.

## Design Lab

Synchronous mock simulation only — no Redis/SQS.
