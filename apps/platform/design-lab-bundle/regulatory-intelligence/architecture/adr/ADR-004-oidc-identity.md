# ADR-004: OIDC enterprise identity boundary

## Decision
Integrate enterprise IdP via OIDC/OAuth2; API issues session from validated tokens.

## Consequences
+ Standard enterprise SSO; no custom password store.
− Tenant mapping and role sync require operational process.

## Alternatives
Custom auth — rejected for regulated clients.
