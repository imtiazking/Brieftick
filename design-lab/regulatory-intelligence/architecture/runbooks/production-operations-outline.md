# Production operations outline (not implemented)

Future runbooks should cover:

- API outage → read-only mode, queue pause
- Database outage → failover, restore from backup
- Object storage → evidence upload degradation
- Queue backlog → scale workers, DLQ replay
- Regulator connector failure → per-connector circuit breaker
- AI provider failure → fixture/degraded advisory only
- Security incident → contain, preserve audit, rotate secrets, tenant assessment
- Rollback → previous deployment + model/config revert with provenance intact

No on-call procedures exist for Design Lab.
