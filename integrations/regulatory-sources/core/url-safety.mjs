const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;

export function assertUrlAllowed(urlString, allowedHosts = []) {
  if (!urlString) return { ok: false, code: 'INVALID_URL', message: 'URL is required' };
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Invalid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'HTTPS_REQUIRED', message: `HTTPS required, got ${url.protocol}` };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, code: 'SSRF_BLOCKED', message: 'localhost blocked' };
  }
  if (PRIVATE_IPV4.test(host) || host === '0.0.0.0') {
    return { ok: false, code: 'SSRF_BLOCKED', message: 'Private network blocked' };
  }
  if (allowedHosts.length > 0) {
    const ok = allowedHosts.some(
      (h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`),
    );
    if (!ok) return { ok: false, code: 'HOST_NOT_ALLOWED', message: `Host not allowlisted: ${host}` };
  }
  return { ok: true, url };
}

export function hostMatchesAllowlist(hostname, allowedHosts) {
  const host = hostname.toLowerCase();
  return allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
}
