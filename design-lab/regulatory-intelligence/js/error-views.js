import { esc, pageHeader } from './components.js';
import { userMessageForCode } from './platform/app-errors.js';
import { normalizeError } from './platform/error-normalize.js';

let errorRefCounter = 0;

export function nextErrorRef() {
  errorRefCounter += 1;
  return `RI-ERR-${Date.now().toString(36)}-${errorRefCounter}`;
}

export function viewPageNotFound(route) {
  return `
    ${pageHeader('Page not found', 'The requested route is not part of Regulatory Intelligence Design Lab.')}
    <div class="ri-not-found">
      <p class="ri-not-found__body">No view is registered for <span class="ri-mono">${esc(route)}</span>.</p>
      <div class="ri-not-found__actions">
        <a class="ri-btn ri-btn--primary" href="#/dashboard">Back to Dashboard</a>
        <a class="ri-btn ri-btn--ghost" href="#/work">Work Queue</a>
      </div>
    </div>`;
}

export function viewErrorBoundary(route, err) {
  const ref = nextErrorRef();
  const norm = normalizeError(err);
  const msg = userMessageForCode(norm.code);
  return `
    ${pageHeader('View unavailable', 'FORGENIQ could not load this view.')}
    <div class="ri-not-found ri-not-found--error" role="alert">
      <p>${esc(msg)}</p>
      <p class="ri-muted">Reference: <span class="ri-mono">${esc(ref)}</span></p>
      <div class="ri-not-found__actions">
        <a class="ri-btn ri-btn--primary" href="#/dashboard">Back to Dashboard</a>
        <button type="button" class="ri-btn ri-btn--ghost" data-retry-view>Retry</button>
      </div>
    </div>`;
}

export function viewPersistenceRecovery(message) {
  return `
    ${pageHeader('Demo state recovered', 'Local demo data could not be fully restored.')}
    <div class="ri-not-found" role="status">
      <p>${esc(message)}</p>
      <p class="ri-muted">A safe deterministic baseline has been loaded. Use Administration → Reset if you need the full presentation dataset.</p>
      <div class="ri-not-found__actions">
        <a class="ri-btn ri-btn--primary" href="#/dashboard">Continue to Dashboard</a>
        <a class="ri-btn ri-btn--ghost" href="#/admin/health">Platform health</a>
      </div>
    </div>`;
}
