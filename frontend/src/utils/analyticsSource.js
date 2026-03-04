export const DATA_SOURCE = {
  native: 'native',
  legacy: 'legacy',
  metabase: 'metabase',
  unknown: 'unknown',
};

export function deriveDataSource(item) {
  if (!item) return DATA_SOURCE.unknown;
  const name = String(item.name || item.title || '').toLowerCase();

  if (
    item.metabaseId ||
    item.metabaseDashboardId ||
    item.metabaseQuestionId ||
    item.metabaseCardId ||
    item.embedType === 'metabase' ||
    item.source === 'metabase'
  ) {
    return DATA_SOURCE.metabase;
  }

  if (
    item.migratedFromSalesforce ||
    item.isLegacy ||
    item.source === 'salesforce' ||
    name.includes('salesforce')
  ) {
    return DATA_SOURCE.legacy;
  }

  return DATA_SOURCE.native;
}

export default deriveDataSource;
