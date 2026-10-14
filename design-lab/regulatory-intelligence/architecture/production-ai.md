# Production AI execution architecture

## Lifecycle

Trusted application context + untrusted regulatory source evidence + organisation context  
→ AI use case policy resolution  
→ context assembly (budgeted)  
→ safety / injection heuristics  
→ provider-neutral request  
→ structured output validation  
→ claim extraction  
→ citation validation  
→ grounding  
→ quality gate  
→ **AI Analysis** (governed business record)  
→ mandatory human review where required  
→ enterprise governance / audit

## Components

| Component | Responsibility |
|-----------|----------------|
| AI Orchestrator | End-to-end execution, idempotency, audit |
| Context Builder | Source sections + org factors with limits |
| Safety Layer | Delimiters, injection heuristics |
| Fixture Provider | Deterministic Design Lab default |
| External Provider | Production boundary — disabled in browser |
| Output Validator | JSON schema checks |
| Citation Validator | Section IDs must be in context |

## Modes

- `fixture` (default)
- `live-verification` (optional, tenant policy + admin flag)
- `production` (disabled in Design Lab)

## Rules

- AI never approves compliance decisions autonomously
- No provider secrets in frontend
- No hidden chain-of-thought exposure
- Source text is `UNTRUSTED_SOURCE_CONTENT`

See also `ai-evaluation.md`, ADR-014–020.
