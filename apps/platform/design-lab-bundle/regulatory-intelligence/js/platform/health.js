import { SCHEMA_VERSION } from '../migrate.js';
import { FIXTURE_PROVIDER_ID } from '../ai-runtime/fixture-provider.js';
import { detectDuplicateIds } from './data-integrity.js';

export function computePlatformHealth(state) {
  const components = [];

  components.push({
    id: 'application',
    name: 'Application',
    status: state ? 'Healthy' : 'Failed',
    detail: 'Design Lab shell',
  });

  components.push({
    id: 'persistence',
    name: 'Local Persistence',
    status: state?.persistenceRecovery?.usedBaseline ? 'Degraded' : 'Healthy',
    detail: state?.persistenceRecovery?.message || 'localStorage v2',
  });

  const connectors = state?.regulatoryConnectors || [];
  const disabledLive = state?.platformConfig?.connectorMode !== 'live';
  components.push({
    id: 'connectors',
    name: 'Regulatory Connector Layer',
    status: disabledLive ? 'Disabled / Not Configured' : 'Degraded',
    detail: disabledLive ? 'Fixture / manual verification mode' : 'Live mode enabled (Design Lab)',
  });

  const aiMode = state?.platformConfig?.aiExecutionMode || 'fixture';
  const fixture = state?.aiProviders?.find((p) => p.id === FIXTURE_PROVIDER_ID);
  components.push({
    id: 'ai-runtime',
    name: 'AI Runtime',
    status: aiMode === 'fixture' && fixture?.status === 'Healthy' ? 'Healthy' : 'Degraded',
    detail: `Mode: ${aiMode}`,
  });

  const dupChanges = detectDuplicateIds(state, 'changes').length;
  const dupPubs = detectDuplicateIds(state, 'publications').length;
  components.push({
    id: 'data-integrity',
    name: 'Data Integrity',
    status: dupChanges || dupPubs ? 'Degraded' : 'Healthy',
    detail: dupChanges || dupPubs ? 'Duplicate IDs detected' : `Schema v${state?.schemaVersion || SCHEMA_VERSION}`,
  });

  return {
    environment: 'FORGENIQ Regulatory Intelligence Design Lab',
    adapter: state?.platformConfig?.adapter || 'local',
    schemaVersion: state?.schemaVersion || SCHEMA_VERSION,
    checkedAt: new Date().toISOString(),
    components,
  };
}
