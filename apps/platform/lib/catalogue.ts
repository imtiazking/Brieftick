import 'server-only';

/**
 * Read-only catalogue metadata from packages/reference-data (no connectors, no ingestion).
 */
export async function getCatalogueSummary() {
  const mod = await import('@forgeniq/reference-data');
  return {
    regulatorCount: mod.REGULATORS.length,
    sourceCount: mod.REGULATORY_SOURCES.length,
  };
}
