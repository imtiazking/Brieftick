import { APP_ERRORS, appError } from './app-errors.js';
import { AI_ERRORS } from '../ai-runtime/ai-errors.js';

export function normalizeError(err) {
  if (!err) return appError(APP_ERRORS.UNKNOWN_ERROR, 'Unknown error');
  if (err.ok === false && err.code) return err;

  const code = err.code || err.name;
  const message = err.message || String(err);

  if (code === AI_ERRORS.AI_PROVIDER_UNAVAILABLE || code === AI_ERRORS.AI_TIMEOUT) {
    return appError(APP_ERRORS.AI_UNAVAILABLE, message, { sourceCode: code });
  }
  if (code === AI_ERRORS.AI_PERMISSION_DENIED) {
    return appError(APP_ERRORS.FORBIDDEN, message, { sourceCode: code });
  }
  if (code === 'STALE_VERSION') {
    return appError(APP_ERRORS.STALE_VERSION, message);
  }
  if (code === 'NOT_FOUND') {
    return appError(APP_ERRORS.NOT_FOUND, message);
  }
  if (message.includes('parse') || code === 'PARSER_FAILURE') {
    return appError(APP_ERRORS.PARSER_FAILURE, message);
  }
  return appError(APP_ERRORS.UNKNOWN_ERROR, message);
}
