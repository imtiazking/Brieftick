/**
 * Phase 84G — listing extractors and connector configs for final four recovery.
 */

const SDAIA_KC_EN =
  'https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8ziPR1dzTwMgw2MDMOcTA3MjH39TE29jY0MLIz1w9EUhIZZAhUEGvl6OXoaGwQY60cRo98AB3A0IKw_Ck0JpgvACvBYEZyap1-QGxphkGWiCAAUDrxA/dz/d5/L0lDUmlTUSEhL3dHa0FKRnNBLzROV3FpQSEhL2Vu/';

export function extractUaecmaRegulationDownloads(html, pageUrl) {
  const base = new URL(pageUrl);
  const seen = new Set();
  const docs = [];
  const re =
    /<a\s+href=(["']?)(\/assets\/download\/[^"'>\s]+)\1[^>]*class=no-underline[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[2].replace(/&amp;/g, '&');
    const url = new URL(path, base).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    docs.push({
      url,
      title,
      publicationType: 'regulatory_decision',
    });
  }
  return docs;
}

export function extractSdaiaKnowledgeCenterDownloads(html, pageUrl) {
  const base = new URL(pageUrl);
  const seen = new Set();
  const docs = [];
  const re =
    /<h4[^>]*>\s*([\s\S]*?)\s*<\/h4>[\s\S]*?href=(["'])(\/wps\/wcm\/connect\/[^"']+\.pdf[^"']*)\2/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const path = m[3].replace(/&amp;/g, '&');
    const url = new URL(path, base).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    docs.push({
      url,
      title,
      publicationType: undefined,
    });
  }
  return docs;
}

export const PHASE84G_SDAIA_LISTING_URL = SDAIA_KC_EN;
export const PHASE84G_UAECMA_LISTING_URL = 'https://www.uaecma.gov.ae/en/regulations/regulations';
export function extractMociRegulationDetailPages(html, pageUrl) {
  const base = new URL(pageUrl);
  const seen = new Set();
  const docs = [];
  const re =
    /<a[^>]+href=(["'])(\/en\/Regulations\/pages\/details\.aspx\?lawId=[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[2];
    const url = new URL(path, base).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const title = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) continue;
    docs.push({ url, title, publicationType: 'legislation' });
  }
  return docs;
}

export const PHASE84G_MOCI_LISTING_URL = 'https://mc.gov.sa/en/Regulations/pages/default.aspx';
