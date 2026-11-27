import { URL } from 'node:url';
import { getConnectorForSource } from '../connector-registry.mjs';

/**
 * @param {{ canonicalUrl: string, sourceExternalKey: string }} params
 */
export function resolveAllowedHostsForPublication(params) {
  const connector = getConnectorForSource(params.sourceExternalKey);
  if (connector?.allowedHosts?.length) {
    return [...new Set(connector.allowedHosts)];
  }
  try {
    const host = new URL(params.canonicalUrl).hostname.toLowerCase();
    const bare = host.replace(/^www\./, '');
    return [...new Set([host, bare, bare === host ? `www.${bare}` : host])];
  } catch {
    return [];
  }
}