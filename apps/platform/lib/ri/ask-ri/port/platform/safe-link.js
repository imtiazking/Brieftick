import { esc } from '../components.js';

const UNSAFE_SCHEMES = /^(javascript:|data:|vbscript:)/i;

export function sanitizeHref(href) {
  if (!href) return '#';
  const trimmed = String(href).trim();
  if (UNSAFE_SCHEMES.test(trimmed)) return '#';
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const url = new URL(trimmed, 'https://example.invalid');
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return '#';
    return trimmed;
  } catch {
    if (trimmed.startsWith('/')) return trimmed;
    return '#';
  }
}

export function safeExternalLink(href, label) {
  const safe = sanitizeHref(href);
  if (safe === '#') return `<span class="ri-muted">${esc(label || 'Link blocked')}</span>`;
  return `<a href="${esc(safe)}" rel="noopener noreferrer">${esc(label || href)}</a>`;
}

export function renderXssTest(text) {
  return esc(text);
}
