/**
 * Production API adapter — calls Next.js /api/ri-lab (Clerk + Supabase server-side).
 */
const NOT_CONFIGURED = 'Production API adapter is not bootstrapped.';

export class ApiPlatformAdapter {
  constructor(options = {}) {
    this.mode = 'api';
    this.active = false;
    this.apiBaseUrl = (options.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
    this._session = null;
    this._readiness = null;
    this._config = null;
  }

  async probe() {
    const res = await fetch(`${this.apiBaseUrl}/session`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  }

  async bootstrap() {
    const sessionRes = await fetch(`${this.apiBaseUrl}/session`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const session = await sessionRes.json().catch(() => ({}));
    if (!sessionRes.ok) {
      const err = new Error(session.error || 'unauthorized');
      err.status = sessionRes.status;
      throw err;
    }

    const readinessRes = await fetch(`${this.apiBaseUrl}/readiness`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const readiness = await readinessRes.json().catch(() => ({}));
    if (!readinessRes.ok || !readiness.ok) {
      const err = new Error(readiness.error || 'backend_not_ready');
      err.status = readinessRes.status;
      throw err;
    }

    this._session = session;
    this._readiness = readiness;
    this._config = {
      environment: readiness.environment || 'connected',
      adapterMode: 'api',
      apiBaseUrl: this.apiBaseUrl,
      tenantMode: 'clerk-organisation',
      auditMode: 'server',
      schemaVersion: 17,
      aiExecutionMode: 'server-controlled',
      allowLiveAiVerification: false,
      regulatoryConnectorMode: 'server',
      allowLiveRegulatoryVerification: false,
      featureFlags: {
        apiAdapter: true,
        multiTenantUi: true,
        optimisticConcurrency: true,
        liveRegulatoryDemo7: false,
      },
      backendReady: true,
      writesEnabled: false,
    };
    this.active = true;
    return { session, readiness };
  }

  getConfig() {
    if (!this._config) throw new Error(NOT_CONFIGURED);
    return this._config;
  }

  getSession() {
    if (!this._session) throw new Error(NOT_CONFIGURED);
    return this._session;
  }

  getTenantContext() {
    const session = this.getSession();
    return {
      tenantId: session.organisationId,
      organisationName: session.organisationName,
      resolvedAt: new Date().toISOString(),
    };
  }

  async query(descriptor) {
    const type = descriptor?.type;
    if (type === 'catalogue.summary') {
      return this._fetchJson('/catalogue/summary');
    }
    if (type === 'catalogue.publications') {
      return this._fetchJson('/publications');
    }
    if (type === 'catalogue.changes') {
      return this._fetchJson('/changes');
    }
    if (type === 'publication' && descriptor.id) {
      return this._fetchJson(`/publications/${encodeURIComponent(descriptor.id)}`);
    }
    throw new Error(`unsupported_query:${type || 'unknown'}`);
  }

  async command() {
    const res = await fetch(`${this.apiBaseUrl}/commands`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) {
      return { ok: false, code: body.error || 'writes_disabled', status: 403, message: body.message };
    }
    if (!res.ok) {
      const err = new Error(body.error || 'command_failed');
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async getPublication(id) {
    const data = await this._fetchJson(`/publications/${encodeURIComponent(id)}`);
    return data.publication || null;
  }

  getChange() {
    return null;
  }

  listChanges() {
    return [];
  }

  getAssessment() {
    return null;
  }

  authorize() {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Connected mode uses server-side RBAC. Mock permissions do not apply.',
    };
  }

  restoreBootstrap({ session, config }) {
    this._session = session;
    this._config = config;
    this.active = true;
  }

  async _fetchJson(path) {
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || 'api_error');
      err.status = res.status;
      throw err;
    }
    return body;
  }
}

export function createApiPlatformAdapter(options) {
  return new ApiPlatformAdapter(options);
}
