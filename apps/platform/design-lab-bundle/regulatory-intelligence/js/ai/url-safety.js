const BLOCKED_SCHEMES = /^(javascript|data|file|ftp|vbscript):/i;

export function isSafeHttpsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (BLOCKED_SCHEMES.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function assertSafeOfficialUrl(url) {
  if (!isSafeHttpsUrl(url)) {
    return { ok: false, message: 'Official citation URL must be HTTPS' };
  }
  return { ok: true };
}
