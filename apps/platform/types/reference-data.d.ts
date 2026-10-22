declare module '@forgeniq/reference-data' {
  export type RegulatorRecord = {
    regulatorId: string;
    name: string;
    acronym?: string;
    jurisdiction?: string;
    country?: string;
    region?: string;
  };
  export type RegulatorySourceRecord = {
    sourceId: string;
    regulatorId: string;
    regulatorName?: string;
    sourceType?: string;
    jurisdiction?: string;
    country?: string;
    region?: string;
    integration?: {
      verificationStatus?: string;
      productionStatus?: 'NOT_ENABLED' | 'ENABLED' | 'DISABLED';
    };
  };
  export const REGULATORS: RegulatorRecord[];
  export const REGULATORY_SOURCES: RegulatorySourceRecord[];
}
