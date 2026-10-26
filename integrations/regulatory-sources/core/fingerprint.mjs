import { createHash } from 'node:crypto';

export async function sha256Hex(content) {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Strip volatile chrome (scripts, typekit tokens, nav) before hashing HTML publications.
 * Preserves substantive body changes inside <article> when present.
 */
export function normaliseHtmlForFingerprint(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/[a-f0-9]{16,}-text\/javascript/gi, 'volatile-script-type');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  const article = s.match(/<article[\s\S]*?<\/article>/i);
  if (article) s = article[0];
  return s.replace(/\s+/g, ' ').trim();
}

function isHtmlContentType(contentType) {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('html');
}

/**
 * @param {string | Buffer | Uint8Array} content
 * @param {{ contentType?: string }} [options]
 */
export async function fingerprintContent(content, options = {}) {
  const contentType = options.contentType ?? '';
  let normalised;
  let normalisation = 'raw_v1';

  if (typeof content === 'string') {
    if (isHtmlContentType(contentType)) {
      normalised = normaliseHtmlForFingerprint(content);
      normalisation = 'html_article_v1';
    } else {
      normalised = content.replace(/\r\n/g, '\n').trim();
    }
  } else {
    const text = Buffer.from(content).toString('utf8');
    if (isHtmlContentType(contentType)) {
      normalised = normaliseHtmlForFingerprint(text);
      normalisation = 'html_article_v1';
    } else {
      normalised = text.replace(/\r\n/g, '\n').trim();
    }
  }

  const hash = await sha256Hex(normalised);
  return { algorithm: 'SHA-256', hash, normalisation };
}
