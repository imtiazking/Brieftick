const MODULE_THEMES = {
  CAP: ['THM-CAPITAL'],
  CRE: ['THM-CREDIT'],
  MAR: ['THM-MARKET'],
  OPE: ['THM-OPRES'],
  SRP: ['THM-GOV', 'THM-CAPITAL'],
  DIS: ['THM-DISCLOSURE'],
  LCR: ['THM-LIQUIDITY'],
  NSF: ['THM-LIQUIDITY'],
  LEV: ['THM-CAPITAL'],
};

const MODULE_SECTORS = {
  CAP: ['SEC-001', 'SEC-005'],
  CRE: ['SEC-001'],
  OPE: ['SEC-001', 'SEC-005'],
  SRP: ['SEC-001'],
  DIS: ['SEC-001', 'SEC-005'],
};

export function assessBaselRelevance({ frameworkModule, documentType, path }) {
  const mod = (frameworkModule || '').toUpperCase();
  const themes = MODULE_THEMES[mod] || ['THM-CAPITAL'];
  const sectors = MODULE_SECTORS[mod] || ['SEC-001'];
  const mapped = mod || (path || '').includes('basel-framework');
  return {
    relevanceStatus: mapped ? 'MAPPED_BY_CONFIGURATION' : 'POTENTIALLY_RELEVANT',
    relevanceReason: mapped ? `BCBS module ${mod || 'framework'} — Banking prudential mapping` : 'BCBS path — review required',
    sectorIds: sectors,
    complianceThemeIds: themes,
    frameworkIds: ['FWK-BASEL'],
  };
}
