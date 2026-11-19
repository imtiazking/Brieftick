# Data classification

| Class | Examples | External AI | Export | Logging |
|-------|----------|-------------|--------|---------|
| Public | FCA/PRA publications, official URLs | Eligible with policy | Allowed with audit | Metadata only |
| Internal | Workflow status, assignments | Tenant policy | Role-gated | Metadata |
| Confidential | IA content, applicability reasoning | Not by default | Restricted | No full text |
| Restricted | Evidence files, security config | Prohibited | Highly restricted | Never secrets |

Tie-breaker: **most restrictive** class wins for mixed context bundles.

Design Lab: all external AI and live connectors **disabled by default**.
