/**
 * URL safety for connector retrieval (SSRF / allowlist). Production-capable boundary.
 */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;

export function assertUrlAllowed(urlString, allowedHosts = []) {
  if (!urlString) return connectorError(CONNECTOR_ERRORS.INVALID_METADATA, 'URL is required');
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return connectorError(CONNECTOR_ERRORS.INVALID_METADATA, 'Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return connectorError(CONNECTOR_ERRORS.UNSUPPORTED_SCHEME, `Scheme not allowed: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return connectorError(CONNECTOR_ERRORS.SSRF_BLOCKED, 'localhost is not allowed');
  }
  if (url.protocol === 'file:') {
    return connectorError(CONNECTOR_ERRORS.SSRF_BLOCKED, 'file:// is not allowed');
  }
  if (PRIVATE_IPV4.test(host) || host === '0.0.0.0') {
    return connectorError(CONNECTOR_ERRORS.SSRF_BLOCKED, 'Private network targets are not allowed');
  }
  if (allowedHosts.length > 0) {
    const ok = allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
    if (!ok) return connectorError(CONNECTOR_ERRORS.URL_NOT_ALLOWED, `Host not on connector allowlist: ${host}`);
  }
  return { ok: true, url };
}
