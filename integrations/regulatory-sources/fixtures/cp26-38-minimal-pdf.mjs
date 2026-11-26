/**
 * Minimal valid PDF for offline acceptance (not the live FCA document).
 */
export function createMinimalCp26PdfBuffer() {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 85>>stream
BT /F1 12 Tf 72 700 Td (CP26/38 Financial Crime Guide updates) Tj 0 -20 Td (Consultation closes 24 December 2026) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000264 00000 n 
0000000400 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
478
%%EOF`;
  return Buffer.from(body, 'utf8');
}
