# Notifications

Future channels: in-app, email, Teams, Slack (not connected in Design Lab).

**Outbox pattern:** transaction writes domain state + outbox row; worker delivers notification. Prevents lost alerts.

Domain events (representative): PublicationDetected, RegulatoryChangeCreated, ActionOverdue, EvidenceAccepted, AssuranceFindingRaised, AIReviewRequired — not full event sourcing.
