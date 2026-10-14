# ADR-019: External AI disabled by tenant policy by default

**Decision:** `tenantAiPolicy.allowExternalAI: false` unless explicitly enabled; no browser credentials.

**Consequences:** Organisation context not sent externally by default.
