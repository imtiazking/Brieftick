#!/usr/bin/env node
import { httpGet } from '../core/http-client.mjs';
import { extractListingLinks } from '../core/html-listing.mjs';

const sec = await httpGet('https://www.sec.gov/rules', { allowedHosts: ['www.sec.gov'] });
console.log('SEC rules', sec.ok, sec.finalUrl, sec.body?.length);

const fil = await httpGet('https://www.fdic.gov/news/financial-institution-letters/index.html', {
  allowedHosts: ['www.fdic.gov'],
});
const filLinks = extractListingLinks(fil.body.toString('utf8'), fil.finalUrl, ['www.fdic.gov'], 5);
console.log('FDIC FIL sample', filLinks);

const sama = await httpGet('https://rulebook.sama.gov.sa/en', { allowedHosts: ['rulebook.sama.gov.sa'] });
const nodes = [...sama.body.toString('utf8').matchAll(/\/en\/node\/\d+/g)].slice(0, 8);
console.log('SAMA nodes', nodes);

const cftc = await httpGet('https://www.cftc.gov/LawRegulation/FederalRegister/index.htm', {
  allowedHosts: ['www.cftc.gov'],
});
const cftcLinks = extractListingLinks(cftc.body.toString('utf8'), cftc.finalUrl, ['www.cftc.gov'], 5);
console.log('CFTC FR links', cftcLinks);

const cfpb = await httpGet('https://www.consumerfinance.gov/rules-policy/final-rules/', {
  allowedHosts: ['www.consumerfinance.gov'],
});
const cfpbLinks = extractListingLinks(cfpb.body.toString('utf8'), cfpb.finalUrl, ['www.consumerfinance.gov'], 5);
console.log('CFPB rules links', cfpbLinks);
