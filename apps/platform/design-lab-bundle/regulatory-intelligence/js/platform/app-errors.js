/**
 * Canonical application error codes (align with API / AI / connector where possible).
 */
export const APP_ERRORS = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  STALE_VERSION: 'STALE_VERSION',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DATA_INTEGRITY_ERROR: 'DATA_INTEGRITY_ERROR',
  PARSER_FAILURE: 'PARSER_FAILURE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export function appError(code, message, details = {}) {
  return { ok: false, code, message, ...details };
}

export function userMessageForCode(code) {
  const map = {
    [APP_ERRORS.NOT_FOUND]: 'The requested record could not be found.',
    [APP_ERRORS.VALIDATION_FAILED]: 'The information provided could not be validated.',
    [APP_ERRORS.FORBIDDEN]: 'You do not have permission to perform this action.',
    [APP_ERRORS.CONFLICT]: 'This action conflicts with the current state of the record.',
    [APP_ERRORS.STALE_VERSION]: 'This record was updated elsewhere. Refresh and try again.',
    [APP_ERRORS.DEPENDENCY_UNAVAILABLE]: 'A required service is temporarily unavailable.',
    [APP_ERRORS.SOURCE_UNAVAILABLE]: 'The regulatory source is not available.',
    [APP_ERRORS.AI_UNAVAILABLE]: 'AI analysis could not be completed at this time.',
    [APP_ERRORS.INVALID_STATE_TRANSITION]: 'This status change is not allowed.',
    [APP_ERRORS.DATA_INTEGRITY_ERROR]: 'Related records are missing or invalid.',
    [APP_ERRORS.PARSER_FAILURE]: 'Source content could not be parsed.',
    [APP_ERRORS.UNKNOWN_ERROR]: 'FORGENIQ could not complete this action.',
  };
  return map[code] || map[APP_ERRORS.UNKNOWN_ERROR];
}
