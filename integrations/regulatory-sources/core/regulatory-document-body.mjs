import { validatePdfSignature } from './regulatory-pdf-retrieval.mjs';

const PORTAL_REJECTION = /request rejected|access denied|support id|unauthorized access/i;

export function isPortalRejectionBody(body, contentType = '') {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('pdf')) return false;
  const text = body.toString('utf8', 0, Math.min(body.length, 8000));
  return PORTAL_REJECTION.test(text);
}

/** True when bytes or Content-Type indicate a regulatory PDF (not extension-only). */
export function isRegulatoryPdfBody(body, contentType = '') {
  if (!body?.length) return false;
  const sig = validatePdfSignature(body);
  if (sig.ok) return true;
  const ct = (contentType || '').toLowerCase();
  return ct.includes('application/pdf');
}

export function inferPublicationClass(title, defaultType = 'regulation') {
  const t = (title || '').toLowerCase();
  if (/implementing regulation|personal data protection law|companies law|legislation|decision no|regulation manual/i.test(t)) {
    return 'legislation';
  }
  if (/guidance|policy|standard contractual|framework|faq/i.test(t) && !/protection law/i.test(t)) {
    return 'guidance';
  }
  if (/decision|circular|board of directors/i.test(t)) {
    return 'regulatory_decision';
  }
  return defaultType;
}

export function pickDecisionReference(title) {
  const m = (title || '').match(/Decision No\.?\s*\(?([^)]+)\)?/i);
  return m ? m[1].trim() : null;
}
