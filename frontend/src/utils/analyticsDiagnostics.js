import { normalizeVerificationStatus } from './analyticsVerification';

const toLower = (value) => String(value || '').toLowerCase();

const normalizeFilters = (filters) => {
  if (!filters) return [];
  if (Array.isArray(filters)) return filters;
  if (typeof filters === 'object') {
    return Object.entries(filters).map(([label, value]) => ({ label, value }));
  }
  return [];
};

const isTightDateRange = (label, value) => {
  const combined = `${label || ''} ${value || ''}`.toLowerCase();
  return (
    combined.includes('today') ||
    combined.includes('yesterday') ||
    combined.includes('this week') ||
    combined.includes('last week') ||
    combined.includes('rolling 7') ||
    combined.includes('rolling 30') ||
    combined.includes('custom')
  );
};

export const buildDiagnostics = (context) => {
  const diagnostics = [];

  if (context?.missingConfig) {
    diagnostics.push('Missing dashboard configuration or layout.');
  }

  if (context?.rowCount === 0 || context?.isEmpty) {
    diagnostics.push('No rows returned.');
  }

  const filters = normalizeFilters(context?.filters);
  if (filters.length > 0) {
    const dateFilter = filters.find((filter) => toLower(filter.label).includes('date'));
    if (filters.length > 1 || (dateFilter && isTightDateRange(dateFilter.label, dateFilter.value))) {
      diagnostics.push('Filters may be too restrictive.');
    }
  }

  const normalizedStatus = normalizeVerificationStatus(context?.verifiedStatus);
  if (normalizedStatus === 'needs_review') {
    diagnostics.push('Analytics health checks reported issues.');
  }

  const source = toLower(context?.source);
  if (source.includes('legacy')) {
    diagnostics.push('Legacy source may have incomplete mappings.');
  }
  if (source.includes('metabase')) {
    diagnostics.push('Metabase permissions or locked filters may be blocking data.');
  }

  return diagnostics;
};

export const normalizeDiagnosticsContext = (context) => {
  if (!context) return null;
  const normalized = { ...context };
  normalized.verifiedStatus = normalizeVerificationStatus(normalized.verifiedStatus);
  if (!Array.isArray(normalized.diagnostics) || normalized.diagnostics.length === 0) {
    normalized.diagnostics = buildDiagnostics(normalized);
  }
  return normalized;
};

export const summarizeFilters = (filters) => normalizeFilters(filters);

export default buildDiagnostics;
