# Environments

| Environment | Purpose |
|-------------|---------|
| Local | Developer / Design Lab (`adapterMode: local`) |
| Development | Shared dev API + DB |
| Test | Automated CI, isolated data |
| Staging | Pre-production validation |
| Production | Live tenants |

Each environment: isolated database, object storage, credentials, configuration. No production data in lower envs without sanitisation.

Feature flags: connector rollout, AI model changes, workflow features (local `platformConfig.featureFlags` stub).
