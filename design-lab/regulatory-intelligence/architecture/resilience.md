# Resilience

- Timeouts and bounded retries on external regulator connectors
- Circuit breakers when sources fail
- Queue-based retry for async work
- Graceful degradation: FCA connector failure must not block reading existing intelligence
- Backups: DB PITR, object versioning, audit backup, tested restore (RPO/RTO = business-defined)
