/**
 * Clerk browser session for the static Design Lab.
 *
 * Clerk session tokens (__session cookie) expire after ~60 s and are only renewed by the Clerk
 * browser SDK. This page is not a Next.js page, so the SDK is loaded here; without it every
 * /api/ri-lab request made a minute after sign-in is rejected by middleware as unauthorized.
 * Authentication is unchanged: the server still verifies every request.
 */

const PUBLISHABLE_KEY_META = 'forgeniq-clerk-publishable-key';
const CLERK_JS_MAJOR = '5';
const SESSION_API_PREFIXES = ['/api/ri-lab', '/api/organisation'];

let clerkReady = null;

function readPublishableKey() {
  const value = document.querySelector(`meta[name="${PUBLISHABLE_KEY_META}"]`)?.getAttribute('content');
  return typeof value === 'string' && /^pk_(live|test)_[A-Za-z0-9+/=_-]+$/.test(value.trim()) ? value.trim() : '';
}

export function frontendApiHostFromPublishableKey(publishableKey) {
  const match = /^pk_(?:live|test)_(.+)$/.exec(publishableKey || '');
  if (!match) return null;
  try {
    const host = atob(match[1]).replace(/\$$/, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

function loadClerkScript(src, publishableKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', publishableKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('clerk_js_load_failed'));
    document.head.appendChild(script);
  });
}

export function initClerkSession() {
  if (clerkReady) return clerkReady;
  clerkReady = (async () => {
    const publishableKey = readPublishableKey();
    const host = frontendApiHostFromPublishableKey(publishableKey);
    if (!publishableKey || !host) return null;
    if (!window.Clerk) {
      await loadClerkScript(`https://${host}/npm/@clerk/clerk-js@${CLERK_JS_MAJOR}/dist/clerk.browser.js`, publishableKey);
    }
    if (typeof window.Clerk === 'function') {
      window.Clerk = new window.Clerk(publishableKey);
    }
    if (!window.Clerk?.load) return null;
    await window.Clerk.load();
    return window.Clerk;
  })().catch((e) => {
    console.warn('[ri-lab] clerk_session_unavailable', e?.message || e);
    return null;
  });
  return clerkReady;
}

/** Renews the __session cookie when the cached token is close to expiry (no-op when signed out). */
export async function ensureFreshClerkSession() {
  const clerk = await initClerkSession();
  if (!clerk?.session) return;
  try {
    await clerk.session.getToken();
  } catch (e) {
    console.warn('[ri-lab] clerk_token_refresh_failed', e?.message || e);
  }
}

function isSessionApiRequest(input) {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!raw) return false;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return SESSION_API_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}

export function installClerkSessionFetchGuard() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__FORGENIQ_CLERK_FETCH_GUARD__) return;
  if (!readPublishableKey()) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (isSessionApiRequest(input)) await ensureFreshClerkSession();
    return nativeFetch(input, init);
  };
  window.__FORGENIQ_CLERK_FETCH_GUARD__ = true;
  void initClerkSession();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installClerkSessionFetchGuard();
}
