#!/usr/bin/env node
import { httpGet } from '../core/http-client.mjs';
import { extractDocumentLinks } from '../core/document-library.mjs';
import { parseFeedItems } from '../core/rss.mjs';

const nfa = await httpGet('https://www.nfa.futures.org/news/rss.asp', {
  allowedHosts: ['www.nfa.futures.org'],
});
console.log('NFA rss head', nfa.body.toString('utf8').slice(0, 500));
console.log('NFA items', parseFeedItems(nfa.body.toString('utf8'), 3));

const zatca = await httpGet('https://zatca.gov.sa/en/Rules/Lists/RulesList/AllItems.aspx', {
  allowedHosts: ['zatca.gov.sa'],
});
console.log('ZATCA docs', extractDocumentLinks(zatca.body.toString('utf8'), zatca.finalUrl, ['zatca.gov.sa'], 5));

const nca = await httpGet('https://nca.gov.sa/en/regulatory-documents/', { allowedHosts: ['nca.gov.sa'] });
console.log('NCA docs', extractDocumentLinks(nca.body.toString('utf8'), nca.finalUrl, ['nca.gov.sa'], 5));

const sca = await httpGet('https://www.sca.gov.ae/en/regulations.aspx', {
  allowedHosts: ['www.sca.gov.ae', 'www.uaecma.gov.ae'],
});
console.log('SCA final', sca.finalUrl);
