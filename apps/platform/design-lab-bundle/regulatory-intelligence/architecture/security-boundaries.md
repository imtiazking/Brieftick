# Server-authorised actions (production mandatory)

These mutations must be enforced on the server in production:

- Governance approval / return / committee
- Evidence accept/reject
- AI human review / override / conflict resolution
- Exception / risk acceptance approval
- Implementation & management attestation
- Assurance finding validation
- Regulatory change closure / reopen
- Board pack finalisation
- Connector / model / config administration
- Mock ingestion run (tenant-scoped)

Design Lab routes these through store command functions with **mock** `assertPermission` where introduced.
