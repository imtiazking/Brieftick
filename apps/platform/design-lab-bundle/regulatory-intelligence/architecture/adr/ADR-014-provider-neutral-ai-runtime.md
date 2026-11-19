# ADR-014: Provider-neutral AI runtime

**Decision:** All AI execution flows through `ai-orchestrator.js` and a provider registry; UI never calls vendors directly.

**Consequences:** New providers plug in without view changes. **Alternatives:** Vendor SDK in browser (rejected).
