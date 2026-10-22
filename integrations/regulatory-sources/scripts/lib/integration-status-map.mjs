/** Map Integration Lab connector status to catalogue integration verificationStatus. */
export function toCatalogueIntegrationStatus(internalStatus) {
  switch (internalStatus) {
    case 'LIVE_VERIFIED':
      return 'LIVE_VERIFIED';
    case 'ACCESS_RESTRICTED':
      return 'ACCESS_RESTRICTED';
    case 'AUTH_REQUIRED':
      return 'AUTH_REQUIRED';
    case 'SOURCE_NOT_FOUND':
    case 'UNSUPPORTED_SOURCE_FORMAT':
      return 'RESEARCH_REQUIRED';
    default:
      return 'RETRIEVAL_FAILED';
  }
}
