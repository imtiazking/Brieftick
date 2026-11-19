# Observability

## Logs

Structured JSON; correlation_id on every command; redact tokens, credentials, full document bodies.

## Metrics

API latency, error rate, ingestion failures, queue depth, job duration, AI processing time, DB health.

## Traces

Single correlation across API → worker → AI → persistence.

## Health

`GET /health/live`, `/health/ready`, `/health/dependencies` (no secrets).

Design Lab: correlation IDs on audit events only (mock).
