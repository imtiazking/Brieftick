# ADR-008: LocalAdapter / ApiAdapter frontend boundary

## Decision
Frontend uses `platform-service.js` with `LocalPlatformAdapter` (Design Lab) and future `ApiPlatformAdapter`.

## Consequences
+ Clear migration path without rewriting all views immediately.
− Some reads still use store during transition.

## Alternatives
Continue direct localStorage in views — rejected.
