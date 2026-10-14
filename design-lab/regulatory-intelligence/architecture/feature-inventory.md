# Feature inventory

| Module | Status | Demo | Production dependency | Limitation |
|--------|--------|------|----------------------|------------|
| Regulatory Intelligence core | Ready for Design Lab | Yes | DB, API | Mock data |
| Ingestion | Prototype | Fixture + manual live | Connectors, workers | No scheduled polling |
| Workflow / Work Queue | Implemented | Yes | Server workflow | Derived in-browser |
| Governance | Prototype | Yes | Server approvals | Mock SoD |
| AI Governance | Prototype | Fixture AI | AI runtime service | No live provider |
| AI Runtime | Prototype | Fixture mode | Secrets, queue | Synchronous |
| Assurance | Prototype | Yes | Assurance service | Mock attestations |
| Board Reporting | Prototype | Yes | Report jobs | Snapshot partial |
| Platform / LocalAdapter | Prototype | Yes | ApiAdapter + infra | localStorage |
| Live Regulatory Integration | Architecture + fixture | Demo 7 optional | Network, allowlists | Live verification deferred |
