declare module '@forgeniq/reference-data' {
  export const REGULATORS: { regulatorId: string }[];
  export const REGULATORY_SOURCES: {
    sourceId: string;
    integration?: { productionStatus?: 'NOT_ENABLED' | 'ENABLED' | 'DISABLED' };
  }[];
}
