#!/usr/bin/env node
/**
 * Bounded official-endpoint research for Batch 1B (stdout only, not production).
 */
import { httpGet } from '../core/http-client.mjs';
import tls from 'node:tls';
import { connect } from 'node:net';

const UA = 'FORGENIQ-Regulatory-Source-Integration-Lab/1.0';

async function probeFetch(label, url, hosts) {
  const r = await httpGet(url, { allowedHosts: hosts, userAgent: UA });
  console.log(
    label,
    url,
    r.ok ? `OK ${r.httpStatus} ${r.contentType?.slice(0, 50)} len=${r.body?.length}` : `${r.code} ${r.message}`,
  );
  if (r.ok && r.body) {
    const t = r.body.toString('utf8', 0, Math.min(800, r.body.length));
    if (t.includes('sitemap') || t.includes('rss') || t.includes('api')) {
      console.log('  snippet:', t.replace(/\s+/g, ' ').slice(0, 200));
    }
  }
  return r;
}

async function tlsHandshake(host, port = 443) {
  return new Promise((resolve) => {
    const socket = connect({ host, port, servername: host }, () => {
      const s = tls.connect({ socket, servername: host, rejectUnauthorized: true }, () => {
        console.log('TLS', host, 'protocol', s.getProtocol(), 'cipher', s.getCipher()?.name);
        s.end();
        resolve({ ok: true });
      });
      s.on('error', (e) => {
        console.log('TLS_ERR', host, e.code, e.message);
        resolve({ ok: false, error: e.message });
      });
    });
    socket.on('error', (e) => {
      console.log('TCP_ERR', host, e.code, e.message);
      resolve({ ok: false, error: e.message });
    });
    socket.setTimeout(15000, () => {
      socket.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

console.log('=== SAMA TLS ===');
await tlsHandshake('www.sama.gov.sa');
await tlsHandshake('sama.gov.sa');

console.log('\n=== SAMA URLs ===');
const samaHosts = ['sama.gov.sa', 'www.sama.gov.sa'];
for (const u of [
  'https://www.sama.gov.sa/en-US/Rules/Pages/default.aspx',
  'https://www.sama.gov.sa/en-US/Rules/Pages/RSS.aspx',
  'https://www.sama.gov.sa/sitemap.xml',
  'https://www.sama.gov.sa/en-US/Pages/default.aspx',
  'https://rulebook.sama.gov.sa/',
]) {
  await probeFetch('SAMA', u, samaHosts);
}

console.log('\n=== CMA SA ===');
const cmaHosts = ['cma.org.sa', 'www.cma.org.sa', 'cma.gov.sa'];
for (const u of [
  'https://cma.org.sa/en/Pages/default.aspx',
  'https://cma.org.sa/en/RulesRegulations/Pages/default.aspx',
  'https://cma.org.sa/en/RulesRegulations/Pages/Rules.aspx',
  'https://cma.org.sa/sitemap.xml',
  'https://cma.org.sa/en/rss.xml',
  'https://cma.gov.sa/en/Pages/default.aspx',
]) {
  await probeFetch('CMA-SA', u, cmaHosts);
}

console.log('\n=== DFSA ===');
const dfsaHosts = ['dfsa.ae', 'www.dfsa.ae', 'dfsa.rulebook.ae'];
for (const u of [
  'https://www.dfsa.ae/news-announcements/rss',
  'https://www.dfsa.ae/sitemap.xml',
  'https://www.dfsa.ae/publications',
  'https://www.dfsa.ae/rulebook',
  'https://dfsa.rulebook.ae/',
  'https://www.dfsa.ae/media-centre',
]) {
  await probeFetch('DFSA', u, dfsaHosts);
}

console.log('\n=== CBUAE ===');
const cbHosts = ['centralbank.ae', 'www.centralbank.ae', 'rulebook.centralbank.ae'];
for (const u of [
  'https://www.centralbank.ae/en/media-and-events/media-centre',
  'https://www.centralbank.ae/en/footer/sitemap',
  'https://www.centralbank.ae/sitemap.xml',
  'https://rulebook.centralbank.ae/en/rulebook',
  'https://rulebook.centralbank.ae/sitemap.xml',
  'https://rulebook.centralbank.ae/en',
  'https://www.centralbank.ae/en/regulations',
]) {
  await probeFetch('CBUAE', u, cbHosts);
}
