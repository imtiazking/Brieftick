import { httpGet } from '../core/http-client.mjs';
import { extractListingLinks } from '../core/html-listing.mjs';
import { parseFeedItems } from '../core/rss.mjs';

const samaRb = await httpGet('https://rulebook.sama.gov.sa/', {
  allowedHosts: ['rulebook.sama.gov.sa'],
});
if (samaRb.ok) {
  const html = samaRb.body.toString('utf8');
  console.log('SAMA rulebook links', extractListingLinks(html, samaRb.finalUrl, ['rulebook.sama.gov.sa'], 8));
  const api = [...html.matchAll(/https?:\/\/rulebook\.sama\.gov\.sa[^"'\s]+/g)].map((m) => m[0]).slice(0, 10);
  console.log('SAMA urls in page', api);
}

const sm = await httpGet('https://cma.org.sa/sitemap.xml', { allowedHosts: ['cma.org.sa', 'cma.gov.sa'] });
if (sm.ok) {
  const xml = sm.body.toString('utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /Rules|Regulation|Circular|Law|Announcement|Enforcement/i.test(u))
    .slice(0, 15);
  console.log('CMA sitemap regulatory', locs);
}

for (const u of [
  'https://cma.org.sa/en/RulesRegulations/Pages/ImplementingRegulations.aspx',
  'https://cma.org.sa/en/RulesRegulations/Pages/Circulars.aspx',
  'https://cma.org.sa/en/MarketConduct/Pages/default.aspx',
]) {
  const r = await httpGet(u, { allowedHosts: ['cma.org.sa', 'cma.gov.sa'] });
  console.log('CMA', u, r.ok ? r.body.length : r.code);
  if (r.ok) console.log(' links', extractListingLinks(r.body.toString('utf8'), u, ['cma.org.sa', 'cma.gov.sa'], 5));
}

import tls from 'node:tls';
import { connect } from 'node:net';
function tlsCheck(host) {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host }, () => {
      tls.connect({ socket, servername: host, rejectUnauthorized: true }, (s) => {
        console.log('TLS ok', host, s.getPeerCertificate()?.issuer?.O);
        s.end();
        resolve();
      }).on('error', (e) => console.log('TLS fail', host, e.message));
    }).on('error', (e) => console.log('TCP fail', host, e.message));
  });
}
await tlsCheck('rulebook.sama.gov.sa');
await tlsCheck('dfsa.rulebook.ae');
await tlsCheck('rulebook.centralbank.ae');

for (const u of ['https://dfsa.rulebook.ae/', 'https://www.dfsa.rulebook.ae/']) {
  const r = await httpGet(u, { allowedHosts: ['dfsa.rulebook.ae', 'www.dfsa.rulebook.ae'] });
  console.log('DFSA rb', u, r.ok ? r.httpStatus + ' len' + r.body.length : r.code, r.message);
}
