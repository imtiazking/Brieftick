/**
 * Minimal structural HTML helpers (no external parser dependency).
 * Matches opening/closing tags with correct nesting for a single tag name.
 */

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * @param {string} html
 * @param {string} tagName
 * @returns {Array<{ start: number, end: number, openTag: string, attrs: string, innerHtml: string, outerHtml: string }>}
 */
export function extractElementsByTagName(html, tagName) {
  const name = String(tagName).toLowerCase();
  const results = [];
  const openRe = new RegExp(`<(${name})(\\s[^>]*)?>`, 'gi');
  let match;
  const s = String(html);
  while ((match = openRe.exec(s)) !== null) {
    const start = match.index;
    const openTag = match[0];
    const attrs = match[2] || '';
    const close = findMatchingClose(s, name, start + openTag.length);
    if (!close) continue;
    const end = close.endIndex;
    const innerHtml = s.slice(start + openTag.length, close.startIndex);
    results.push({
      start,
      end,
      openTag,
      attrs,
      innerHtml,
      outerHtml: s.slice(start, end),
    });
    openRe.lastIndex = end;
  }
  return results;
}

/**
 * @param {string} html
 * @param {number} searchFrom index after opening tag
 */
function findMatchingClose(html, tagName, searchFrom) {
  const name = tagName.toLowerCase();
  const openRe = new RegExp(`<${name}(\\s[^>]*)?>`, 'gi');
  const closeRe = new RegExp(`</${name}\\s*>`, 'gi');
  let depth = 1;
  let cursor = searchFrom;
  while (depth > 0 && cursor < html.length) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return { startIndex: nextClose.index, endIndex: nextClose.index + nextClose[0].length };
      }
      cursor = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

/**
 * @param {string} attrs
 * @returns {Record<string, string>}
 */
export function parseHtmlAttributes(attrs) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrs)) !== null) {
    out[m[1].toLowerCase()] = m[2];
  }
  const classMatch = /class\s*=\s*"([^"]*)"/i.exec(attrs);
  if (classMatch) out.class = classMatch[1];
  return out;
}

export function classListIncludes(attrs, className) {
  const parsed = parseHtmlAttributes(attrs);
  const classes = (parsed.class || '').split(/\s+/).filter(Boolean);
  return classes.includes(className);
}

/**
 * Remove elements with exact class token from HTML fragment.
 * @param {string} html
 * @param {string} className
 */
export function removeElementsWithClass(html, className) {
  let s = String(html);
  const elements = [...extractElementsByTagName(s, 'article'), ...extractElementsByTagName(s, 'div')];
  for (const el of elements) {
    if (classListIncludes(el.attrs, className)) {
      s = s.replace(el.outerHtml, '');
    }
  }
  return s;
}

export function stripDocumentChrome(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s;
}
