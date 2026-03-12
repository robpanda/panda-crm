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
  const filters = normalizeFilters(context?.filters);
  const dateFilter = filters.find((filter) => toLower(filter.label).includes('date'));
  const normalizedStatus = normalizeVerificationStatus(context?.verifiedStatus);
  const source = toLower(context?.source);

  if (context?.missingConfig) {
    diagnostics.push('Missing dashboard configuration or layout.');
  }

  if (context?.rowCount === 0 || context?.isEmpty) {
    diagnostics.push('No records in the selected date range.');
  }

  if (filters.length > 0) {
    if (filters.length > 1 || (dateFilter && isTightDateRange(dateFilter.label, dateFilter.value))) {
      diagnostics.push('Filters too restrictive.');
    }
  }

  if (normalizedStatus === 'needs_review') {
    diagnostics.push('Analytics health checks reported issues.');
  }

  if (source.includes('legacy') || normalizedStatus === 'needs_review') {
    diagnostics.push('Data mapping missing.');
  }
  if (source.includes('metabase')) {
    diagnostics.push('Metabase permissions or locked filters may be blocking data.');
  }

  if (!diagnostics.includes('No records in the selected date range.')) {
    diagnostics.push('No records in the selected date range.');
  }
  if (!diagnostics.includes('Filters too restrictive.')) {
    diagnostics.push('Filters too restrictive.');
  }
  if (!diagnostics.includes('Data mapping missing.')) {
    diagnostics.push('Data mapping missing.');
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
