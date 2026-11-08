/**
 * Step 81D — Ask RI via production backend (/api/ri-lab/ask-ri).
 */
import { isConnectedBackendActive } from './connected-mode.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function submitConnectedAskRi(state, question) {
  if (!isConnectedBackendActive(state)) {
    return { ok: false, code: 'not_connected' };
  }
  const res = await fetch(`${apiBase(state)}/ask-ri`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const contentType = res.headers.get('content-type') || '';
  let body = {};
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => ({}));
  } else if (!res.ok) {
    return {
      ok: false,
      code: `http_${res.status}`,
      status: res.status,
      authError: res.status === 401 || res.status === 403,
      backendError: res.status !== 401 && res.status !== 403,
      message:
        res.status === 404
          ? 'Ask RI API route was not found on the server. Restart or redeploy the platform app so /api/ri-lab/ask-ri is available.'
          : 'Ask RI returned a non-JSON error response from the server.',
    };
  }
  if (!res.ok || body.ok === false) {
    const code = body.error || (res.ok ? 'ask_ri_failed' : `http_${res.status}`);
    const authError =
      res.status === 401 ||
      res.status === 403 ||
      code === 'unauthorized' ||
      code === 'forbidden' ||
      code === 'organisation_required';
    const backendError = !authError;
    const message =
      body.message ||
      (authError
        ? 'Sign in with an organisation role that includes Ask RI read access.'
        : code === 'internal_error'
          ? 'Ask RI could not complete on the server. Your question was not answered — try again or contact your administrator.'
          : code);
    return { ok: false, code, status: res.status, authError, backendError, message };
  }
  return { ok: true, lastAsk: body.lastAsk, status: body.status };
}
