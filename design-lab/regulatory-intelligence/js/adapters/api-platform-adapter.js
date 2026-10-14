/**
 * Future production API adapter contract (non-functional in Design Lab).
 */
const NOT_CONFIGURED = 'Production API adapter is not configured in Design Lab.';

export class ApiPlatformAdapter {
  constructor() {
    this.mode = 'api';
    this.active = false;
  }

  getConfig() {
    throw new Error(NOT_CONFIGURED);
  }

  getSession() {
    throw new Error(NOT_CONFIGURED);
  }

  query() {
    throw new Error(NOT_CONFIGURED);
  }

  command() {
    throw new Error(NOT_CONFIGURED);
  }
}

export function createApiPlatformAdapter() {
  return new ApiPlatformAdapter();
}
