# Phase 2B.2 Step G — retrieval miss analysis

Analysed 5 strict-recall misses / multi-source cases.

## DEV-B2-FG24-01
- **Class:** GENUINE_MISS
- **Root cause:** FG24/6 ranked in top-5 chunks but CP26/38 financial crime PDF volume wins max-pool publication score (chunk-count / semantic overlap on payments fraud).
- **Selected:** 4d05b49b-a4a4-4101-8c87-7d3983315f25
- **Expected:** ec168f48-1717-4631-8e4a-a3e95df4d5ce

## DEV-B2-FG24-02
- **Class:** GENUINE_MISS
- **Root cause:** Lexical overlap on “calibrated controls” routed to Fair value consumer finance supervisory examples instead of FG24/6 payments guidance.
- **Selected:** 56b0beca-d8c3-4267-a794-9079009af661
- **Expected:** ec168f48-1717-4631-8e4a-a3e95df4d5ce

## DEV-B2-WHL-02
- **Class:** GENUINE_MISS
- **Root cause:** AML/sanctions vocabulary matches CP26/38 crime guide chunks more strongly than wholesale Insights 3 HTML (large competing corpus).
- **Selected:** 4d05b49b-a4a4-4101-8c87-7d3983315f25
- **Expected:** caeb51af-829e-478d-b816-bee61252678a

## DEV-B2-CASH24-01
- **Class:** GENUINE_MISS
- **Root cause:** Reporting period not encoded in embeddings; 2025 H1 and 2024 H2 cash coverage pages are semantically near-duplicates — recency bias toward 2025 H1.
- **Selected:** 9e8d3736-506a-4909-8ad4-08229e0e6249
- **Expected:** 0d3468e6-1060-45da-abfc-90c41fda2596

## DEV-TEMP-CASH-02
- **Class:** GENUINE_MISS
- **Root cause:** Expected publication not ranked first; see ranked publications and passages.
- **Selected:** 9e8d3736-506a-4909-8ad4-08229e0e6249
- **Expected:** 0d3468e6-1060-45da-abfc-90c41fda2596
