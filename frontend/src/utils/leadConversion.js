export function resolveOpportunityTypeFromWorkType(workType) {
  if (!workType) return 'INSURANCE';
  const normalized = String(workType).trim().toLowerCase();
  if (normalized === 'retail') return 'RETAIL';
  return 'INSURANCE';
}
