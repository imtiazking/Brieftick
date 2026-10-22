#!/usr/bin/env node
import { httpGet } from '../core/http-client.mjs';

const probes = [
  ['SDAIA', 'https://sdaia.gov.sa/en/PDPL', ['sdaia.gov.sa']],
  ['SDAIA2', 'https://sdaia.gov.sa/en/PDPL/Regulations/Pages/default.aspx', ['sdaia.gov.sa']],
  ['VARA', 'https://www.vara.ae/en/regulatory-framework', ['www.vara.ae']],
  ['VARA2', 'https://www.vara.ae/en/regulations', ['www.vara.ae']],
  ['SCA', 'https://www.sca.gov.ae/en/regulations.aspx', ['www.sca.gov.ae', 'www.uaecma.gov.ae']],
  ['FIU', 'https://www.uaefiu.gov.ae/en/publications', ['www.uaefiu.gov.ae']],
  ['FIU2', 'https://www.uaefiu.gov.ae/en/media', ['www.uaefiu.gov.ae']],
  ['CFTC', 'https://www.cftc.gov/PressRoom/PressReleases/RSS/index.htm', ['www.cftc.gov']],
  ['CFTC2', 'https://www.cftc.gov/PressRoom/PressReleases/rss.xml', ['www.cftc.gov']],
  ['FDIC', 'https://www.fdic.gov/news/press-releases/rss.xml', ['www.fdic.gov']],
  ['FDIC2', 'https://www.fdic.gov/news/press-releases/2025/index.html', ['www.fdic.gov']],
  ['OCC', 'https://www.occ.gov/news-issuances/bulletins/2024/index-bulletins.html', ['www.occ.gov']],
  ['OCC2', 'https://www.occ.gov/news-issuances/news-releases/index-news-releases.html', ['www.occ.gov']],
  ['OFAC', 'https://ofac.treasury.gov/recent-actions', ['ofac.treasury.gov']],
  ['NFA', 'https://www.nfa.futures.org/rulebookfilings/rulebookfilings.aspx', ['www.nfa.futures.org']],
  ['IA', 'https://www.ia.gov.sa/en/rules-and-regulations', ['www.ia.gov.sa']],
  ['ZATCA', 'https://zatca.gov.sa/en/Rules/Lists/RulesList/AllItems.aspx', ['zatca.gov.sa']],
  ['NCA', 'https://nca.gov.sa/en/regulatory-documents/', ['nca.gov.sa']],
  ['SALEG', 'https://laws.boe.gov.sa/BoeLaws/Laws/Folders/1', ['laws.boe.gov.sa']],
  ['FRB', 'https://www.federalreserve.gov/feeds/press_all.xml', ['www.federalreserve.gov']],
];

for (const [name, url, hosts] of probes) {
  const r = await httpGet(url, { allowedHosts: hosts });
  console.log(name, r.ok ? `OK ${r.status}` : `FAIL ${r.status || ''} ${r.message || ''}`, 'len', r.body?.length || 0);
}
