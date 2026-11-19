/** Auto-updated by verify-ri-live-legislation.mjs */
export const LEGISLATION_VERIFICATION_EVIDENCE = {
  "schemaVersion": 1,
  "verificationType": "UK LEGISLATION LIVE VERIFICATION",
  "status": "LIVE_VERIFIED",
  "authority": "The National Archives",
  "sourceName": "legislation.gov.uk",
  "officialHost": "www.legislation.gov.uk",
  "feedType": "application/atom+xml",
  "discoveryFeedUrl": "https://www.legislation.gov.uk/new/data.feed",
  "userAgent": "FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0",
  "lastVerifiedAt": "2026-10-14T11:48:18.994Z",
  "verifiedFrameworkIds": [
    "FWK-BANK-ACT",
    "FWK-CCA",
    "FWK-INS-ACT",
    "FWK-PSR",
    "FWK-EMR",
    "FWK-PENS-1995",
    "FWK-PENS-2004"
  ],
  "verifiedRecordIds": [
    "LEG-UKPGA-2009-21",
    "LEG-UKPGA-1974-39",
    "LEG-UKPGA-2015-4",
    "LEG-UKSI-2017-752",
    "LEG-UKSI-2011-99",
    "LEG-UKPGA-1995-26",
    "LEG-UKPGA-2004-35"
  ],
  "targetRecords": [
    {
      "frameworkId": "FWK-BANK-ACT",
      "recordId": "LEG-UKPGA-2009-21",
      "path": "ukpga/2009/21",
      "canonicalUrl": "https://www.legislation.gov.uk/ukpga/2009/21",
      "officialIdentifier": "ukpga/2009/21",
      "sourceHash": "1bd0754f5a01054e652e7682315a146bc54a74a2af426690a169cc86c78e1cbc",
      "httpStatus": 200,
      "entryCount": 4
    },
    {
      "frameworkId": "FWK-CCA",
      "recordId": "LEG-UKPGA-1974-39",
      "path": "ukpga/1974/39",
      "canonicalUrl": "https://www.legislation.gov.uk/ukpga/1974/39",
      "officialIdentifier": "ukpga/1974/39",
      "sourceHash": "b46d6e932db4a9e63385d7670f316a731670ab41684598f7a82aee680071d039",
      "httpStatus": 200,
      "entryCount": 3
    },
    {
      "frameworkId": "FWK-INS-ACT",
      "recordId": "LEG-UKPGA-2015-4",
      "path": "ukpga/2015/4",
      "canonicalUrl": "https://www.legislation.gov.uk/ukpga/2015/4",
      "officialIdentifier": "ukpga/2015/4",
      "sourceHash": "9c386072c6d6f353e1bbc9ad1678a5ac1750ca7b78fe22110b426dfeccf4da3b",
      "httpStatus": 200,
      "entryCount": 4
    },
    {
      "frameworkId": "FWK-PSR",
      "recordId": "LEG-UKSI-2017-752",
      "path": "uksi/2017/752",
      "canonicalUrl": "https://www.legislation.gov.uk/uksi/2017/752",
      "officialIdentifier": "uksi/2017/752",
      "sourceHash": "920374dd562265f61a808da53d51630fbfffafccfd5568fa6b614bb7c15b2c5c",
      "httpStatus": 200,
      "entryCount": 4
    },
    {
      "frameworkId": "FWK-EMR",
      "recordId": "LEG-UKSI-2011-99",
      "path": "uksi/2011/99",
      "canonicalUrl": "https://www.legislation.gov.uk/uksi/2011/99",
      "officialIdentifier": "uksi/2011/99",
      "sourceHash": "8c4811d1f3b178d988b81d0cf3917afc020cc5d364f8ff0b80bc8d95320bfaaf",
      "httpStatus": 200,
      "entryCount": 4
    },
    {
      "frameworkId": "FWK-PENS-1995",
      "recordId": "LEG-UKPGA-1995-26",
      "path": "ukpga/1995/26",
      "canonicalUrl": "https://www.legislation.gov.uk/ukpga/1995/26",
      "officialIdentifier": "ukpga/1995/26",
      "sourceHash": "5b31b164da3cf32a4b002bcd7133fc7d2768d4a2eadebaf3f7c5f35df19bd248",
      "httpStatus": 200,
      "entryCount": 7
    },
    {
      "frameworkId": "FWK-PENS-2004",
      "recordId": "LEG-UKPGA-2004-35",
      "path": "ukpga/2004/35",
      "canonicalUrl": "https://www.legislation.gov.uk/ukpga/2004/35",
      "officialIdentifier": "ukpga/2004/35",
      "sourceHash": "06d7ad14ba678b3700121bd9a7f166ba4b188b663fd1dee1a510adf317eb5fc0",
      "httpStatus": 200,
      "entryCount": 13
    }
  ],
  "feedProbe": {
    "ok": true,
    "httpStatus": 200,
    "contentType": "application/atom+xml",
    "redirectCount": 0,
    "finalUrl": "https://www.legislation.gov.uk/new/data.feed"
  },
  "feedItemsParsed": 20,
  "security": {
    "httpsOnly": true,
    "hostAllowlist": [
      "www.legislation.gov.uk",
      "legislation.gov.uk"
    ],
    "userAgent": "FORGENIQ-Regulatory-Intelligence-Design-Lab/1.0"
  },
  "history": [
    {
      "at": "2026-10-14T11:48:18.994Z",
      "event": "VERIFICATION PASSED",
      "checks": [
        {
          "name": "allowlist-feed",
          "ok": true,
          "detail": ""
        },
        {
          "name": "https-feed",
          "ok": true,
          "detail": ""
        },
        {
          "name": "block-localhost",
          "ok": true,
          "detail": ""
        },
        {
          "name": "feed-reachable",
          "ok": true,
          "detail": ""
        },
        {
          "name": "feed-parses",
          "ok": true,
          "detail": ""
        },
        {
          "name": "feed-has-items",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-ukpga/2009/21",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-ukpga/1974/39",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-ukpga/2015/4",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-uksi/2017/752",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-uksi/2011/99",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-ukpga/1995/26",
          "ok": true,
          "detail": ""
        },
        {
          "name": "target-ukpga/2004/35",
          "ok": true,
          "detail": ""
        },
        {
          "name": "discover-live",
          "ok": true,
          "detail": ""
        },
        {
          "name": "min-target-set",
          "ok": true,
          "detail": ""
        }
      ]
    }
  ]
};
